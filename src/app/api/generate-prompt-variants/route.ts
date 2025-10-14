import { getDataDirectory } from "@/lib/config-loader";
import { generateText } from "ai";
import { promises as fs } from "fs";
import * as path from "path";

export const maxDuration = 30;

// Load current prompt from data/prompt.md
async function loadPrompt(): Promise<string> {
  const dataDir = getDataDirectory();
  const promptPath = path.join(dataDir, "prompt.md");
  try {
    const data = await fs.readFile(promptPath, "utf-8");
    return data.trim();
  } catch {
    return "You are a helpful assistant.";
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

    // Load current prompt
    const currentPrompt = await loadPrompt();

    // Generate two variants with different improvement strategies
    // Variant A: Focus on tone and conciseness
    const variantA = await improvePrompt(
      currentPrompt,
      [
        "Make responses more concise and direct",
        "Improve tone to be more engaging and friendly",
        "Remove unnecessary verbosity",
      ],
      [
        "Current responses could be more succinct while maintaining clarity",
        "Tone should be warm but professional",
      ],
      reflectionModel
    );

    // Variant B: Focus on detail and accuracy
    const variantB = await improvePrompt(
      currentPrompt,
      [
        "Add more detail and step-by-step explanations",
        "Improve accuracy by being more specific and thorough",
        "Include more context and examples where appropriate",
      ],
      [
        "Responses should provide comprehensive information",
        "Users benefit from detailed explanations and examples",
      ],
      reflectionModel
    );

    return new Response(
      JSON.stringify({
        variantA,
        variantB,
        seedPrompt: currentPrompt,
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
