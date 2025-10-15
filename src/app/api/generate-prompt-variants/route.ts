import { getDataDirectory } from "@/lib/config-loader";
import { generateObject, generateText } from "ai";
import { promises as fs } from "fs";
import * as path from "path";
import { z } from "zod";

export const maxDuration = 30;

// Type definitions
interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Sample {
  id: string;
  timestamp: string;
  messages: Message[];
  feedback?: {
    rating: "positive" | "negative";
    comment?: string;
  };
  systemPrompt?: string; // Track which prompt generated this sample
}

interface SampleGroup {
  id: string;
  name: string;
  samples: Sample[];
  createdAt: string;
  improveHistory?: ImproveHistoryEntry[];
}

interface ImproveHistoryEntry {
  timestamp: string;
  seedPrompt: string;
  variantAPrompt: string;
  variantBPrompt: string;
  variantAStrategy: string;
  variantBStrategy: string;
  winner?: "A" | "B" | "tie" | "both-bad";
}

interface SamplesData {
  groups: SampleGroup[];
  currentGroupId: string;
}

// Load current prompt from data/prompt.md
async function loadPrompt(): Promise<string> {
  const dataDir = getDataDirectory();
  const promptPath = path.join(dataDir, "prompt.md");
  try {
    let data = await fs.readFile(promptPath, "utf-8");

    // Strip markdown code fence syntax if present
    data = data.replace(/^```(?:markdown|plaintext)?\s*\n?/gm, '');
    data = data.replace(/\n?```\s*$/gm, '');

    return data.trim();
  } catch {
    return "You are a helpful assistant.";
  }
}

// Load samples from current group
async function loadCurrentGroupSamples(): Promise<Sample[]> {
  const dataDir = getDataDirectory();
  const samplesPath = path.join(dataDir, "samples.json");
  try {
    const data = await fs.readFile(samplesPath, "utf-8");
    const samplesData: SamplesData = JSON.parse(data);
    const currentGroup = samplesData.groups.find(
      (g) => g.id === samplesData.currentGroupId
    );
    return currentGroup?.samples || [];
  } catch (error) {
    console.error("[LoadSamples] Error loading samples:", error);
    return [];
  }
}

// Load improve history from current group
async function loadImproveHistory(): Promise<ImproveHistoryEntry[]> {
  const dataDir = getDataDirectory();
  const samplesPath = path.join(dataDir, "samples.json");
  try {
    const data = await fs.readFile(samplesPath, "utf-8");
    const samplesData: SamplesData = JSON.parse(data);
    const currentGroup = samplesData.groups.find(
      (g) => g.id === samplesData.currentGroupId
    );
    return currentGroup?.improveHistory || [];
  } catch (error) {
    console.error("[LoadHistory] Error loading improve history:", error);
    return [];
  }
}

// Schema for group analysis output
const GroupAnalysisSchema = z.object({
  positivePatternsCount: z.number().describe("Number of positive samples"),
  negativePatternsCount: z.number().describe("Number of negative samples"),
  keyStrengths: z
    .array(z.string())
    .describe(
      "Key strengths observed in positive samples (max 3 specific insights)"
    ),
  keyIssues: z
    .array(z.string())
    .describe(
      "Key issues observed in negative samples (max 3 specific problems)"
    ),
  userFeedbackThemes: z
    .array(z.string())
    .describe("Recurring themes from user feedback comments"),
  exploitationStrategy: z
    .string()
    .describe(
      "Strategy description for doubling down on what works (1 sentence)"
    ),
  explorationStrategy: z
    .string()
    .describe(
      "Strategy description for trying something different to address issues (1 sentence)"
    ),
  exploitationSuggestions: z
    .array(z.string())
    .describe(
      "3-5 specific suggestions for the exploitation variant (refine what works)"
    ),
  explorationSuggestions: z
    .array(z.string())
    .describe(
      "3-5 specific suggestions for the exploration variant (address issues)"
    ),
  exploitationFeedbacks: z
    .array(z.string())
    .describe("2-3 feedback statements for exploitation variant"),
  explorationFeedbacks: z
    .array(z.string())
    .describe("2-3 feedback statements for exploration variant"),
});

type GroupAnalysis = z.infer<typeof GroupAnalysisSchema>;

/**
 * Analyze group history to intelligently decide variant strategies
 * This is inspired by prompt-optimizer's data-driven approach
 */
async function analyzeGroupHistory(
  samples: Sample[],
  improveHistory: ImproveHistoryEntry[],
  currentPrompt: string,
  reflectionModel: string
): Promise<GroupAnalysis> {
  // Build analysis context from samples
  const positiveSamples = samples.filter(
    (s) => s.feedback?.rating === "positive"
  );
  const negativeSamples = samples.filter(
    (s) => s.feedback?.rating === "negative"
  );

  const samplesContext = `
POSITIVE SAMPLES (${positiveSamples.length} total):
${positiveSamples
  .slice(0, 5)
  .map(
    (s, idx) => `
Example ${idx + 1}:
System Prompt Used: ${s.systemPrompt ? `"${s.systemPrompt.substring(0, 150)}..."` : "Unknown (legacy sample)"}
User: ${s.messages.find((m) => m.role === "user")?.content || "N/A"}
Assistant: ${s.messages.find((m) => m.role === "assistant")?.content || "N/A"}
Feedback: ${s.feedback?.comment || "No comment"}
`
  )
  .join("\n")}

NEGATIVE SAMPLES (${negativeSamples.length} total):
${negativeSamples
  .slice(0, 5)
  .map(
    (s, idx) => `
Example ${idx + 1}:
System Prompt Used: ${s.systemPrompt ? `"${s.systemPrompt.substring(0, 150)}..."` : "Unknown (legacy sample)"}
User: ${s.messages.find((m) => m.role === "user")?.content || "N/A"}
Assistant: ${s.messages.find((m) => m.role === "assistant")?.content || "N/A"}
Feedback: ${s.feedback?.comment || "No comment"}
`
  )
  .join("\n")}
`;

  const historyContext =
    improveHistory.length > 0
      ? `
PREVIOUS IMPROVEMENT ATTEMPTS (${improveHistory.length} total):
${improveHistory
  .slice(-3)
  .map(
    (h, idx) => `
Attempt ${idx + 1}:
- Variant A Strategy: ${h.variantAStrategy}
- Variant B Strategy: ${h.variantBStrategy}
- Winner: ${h.winner || "Unknown"}
`
  )
  .join("\n")}
`
      : "\nNo previous improvement attempts in this group.";

  const analysisPrompt = `You are an expert prompt engineer analyzing sample data to decide optimization strategies.

CURRENT PROMPT:
"""
${currentPrompt}
"""

${samplesContext}

${historyContext}

TASK:
Analyze the samples above and decide on TWO different variant strategies:

1. **Exploitation Variant**: Double down on what's working. Refine strengths from positive samples.
2. **Exploration Variant**: Address issues from negative samples. Try new approaches.

Your analysis should:
- **Identify prompt patterns**: Look at which system prompts led to positive vs negative samples
- **Find correlations**: Do certain prompt phrasings, instructions, or tones correlate with better outcomes?
- **Avoid what fails**: Notice which prompt elements appear in negative samples
- **Leverage what works**: Identify prompt elements that consistently appear in positive samples
- Focus on actionable insights from user feedback
- Avoid repeating strategies from previous attempts (if any)
- Balance refinement (exploit) with innovation (explore)

Provide specific, targeted suggestions based on ACTUAL patterns in the data, especially focusing on which prompt characteristics led to success or failure.`;

  try {
    const result = await generateObject({
      model: reflectionModel,
      schema: GroupAnalysisSchema,
      prompt: analysisPrompt,
    });

    return result.object;
  } catch (error) {
    console.error("[AnalyzeGroup] Error analyzing group history:", error);
    // Fallback to default strategies
    return {
      positivePatternsCount: positiveSamples.length,
      negativePatternsCount: negativeSamples.length,
      keyStrengths: ["Responses are generally well-received"],
      keyIssues: ["Some responses could be improved"],
      userFeedbackThemes: ["Mixed feedback on response style"],
      exploitationStrategy: "Refine tone and structure of successful responses",
      explorationStrategy: "Address clarity and directness concerns",
      exploitationSuggestions: [
        "Maintain current tone and style for similar queries",
        "Keep successful response patterns",
      ],
      explorationSuggestions: [
        "Improve clarity and conciseness",
        "Address specific user concerns from feedback",
      ],
      exploitationFeedbacks: [
        "Current approach works well for some queries",
      ],
      explorationFeedbacks: ["Some responses need improvement"],
    };
  }
}

// GEPA-style prompt improvement function (similar to improvePrompt in optimize/route.ts)
async function improvePrompt(
  currentPrompt: string,
  suggestions: string[],
  feedbacks: string[],
  reflectionModel: string
): Promise<string> {
  const consolidatedSuggestions = suggestions.join("\n\n---\n\n");
  const consolidatedFeedbacks = feedbacks.join("\n\n---\n\n");

  const improvementPrompt = `You are an expert prompt engineer. Improve the following prompt based on evaluation feedback.

CURRENT PROMPT:
"""
${currentPrompt}
"""

EVALUATION FEEDBACKS:
${consolidatedFeedbacks}

SUGGESTED IMPROVEMENTS:
${consolidatedSuggestions}

Analyze all the feedback and suggestions above. Then write an IMPROVED version of the prompt that:
1. Addresses the most critical issues identified
2. Incorporates the suggested improvements where they make sense
3. Maintains clarity and specificity
4. Keeps what's working well

Return ONLY the improved prompt text, nothing else.`;

  try {
    const result = await generateText({
      model: reflectionModel,
      prompt: improvementPrompt,
    });

    return result.text.trim();
  } catch (error) {
    console.error("[Improve] Error improving prompt:", error);
    return currentPrompt;
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const reflectionModel = body.reflectionModel || "openai/gpt-4o";

    // Load current prompt and group data
    const currentPrompt = await loadPrompt();
    const samples = await loadCurrentGroupSamples();
    const improveHistory = await loadImproveHistory();

    console.log(
      `[GenerateVariants] Analyzing ${samples.length} samples and ${improveHistory.length} previous attempts`
    );

    // Analyze group history to decide intelligent variant strategies
    const analysis = await analyzeGroupHistory(
      samples,
      improveHistory,
      currentPrompt,
      reflectionModel
    );

    console.log("[GenerateVariants] Analysis complete:", {
      positive: analysis.positivePatternsCount,
      negative: analysis.negativePatternsCount,
      exploitationStrategy: analysis.exploitationStrategy,
      explorationStrategy: analysis.explorationStrategy,
    });

    // Generate Variant A: Exploitation (double down on what works)
    const variantA = await improvePrompt(
      currentPrompt,
      analysis.exploitationSuggestions,
      analysis.exploitationFeedbacks,
      reflectionModel
    );

    // Generate Variant B: Exploration (address issues, try new approaches)
    const variantB = await improvePrompt(
      currentPrompt,
      analysis.explorationSuggestions,
      analysis.explorationFeedbacks,
      reflectionModel
    );

    return new Response(
      JSON.stringify({
        variantA,
        variantB,
        seedPrompt: currentPrompt,
        analysis: {
          exploitationStrategy: analysis.exploitationStrategy,
          explorationStrategy: analysis.explorationStrategy,
          keyStrengths: analysis.keyStrengths,
          keyIssues: analysis.keyIssues,
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[Generate Variants] Error:", error);
    return new Response(
      JSON.stringify({
        error:
          error instanceof Error ? error.message : "Failed to generate variants",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
