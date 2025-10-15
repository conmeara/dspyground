import { generateText } from "ai";
import "dotenv/config";

export const maxDuration = 60;

const PROMPT_IMPROVEMENT_SYSTEM = `You are an expert prompt engineer tasked with improving system prompts to make them more effective and well-structured.

Your goal is to develop an improved system prompt based on the user's provided prompt or task description.

Guidelines for Improvement:

**Understand the Task**: Grasp the main objective, goals, requirements, constraints, and expected output of the original prompt.

**Minimal Changes**: If the existing prompt is already well-structured and complex, enhance clarity and add missing elements without altering the original structure. For simple prompts, feel free to expand and improve more substantially.

**Reasoning Before Conclusions**: Encourage reasoning steps before any conclusions are reached. If the user provides examples where reasoning happens afterward, reverse the order so that reasoning always comes before conclusions. Conclusion, classifications, or results should ALWAYS appear last in examples.

**Examples**: Include high-quality examples if they would be helpful, using placeholders {{in double curly braces}} for complex elements. Consider:
- What kinds of examples may need to be included
- How many examples are appropriate (typically 1-3)
- Whether examples are complex enough to benefit from placeholders
- If examples are shorter than realistic ones would be, add a note explaining expected length differences

**Clarity and Conciseness**: Use clear, specific language. Avoid unnecessary instructions or bland statements. Remove redundancy.

**Formatting**: Use markdown features (headers, bullets, etc.) for readability. DO NOT USE \`\`\` CODE BLOCKS UNLESS SPECIFICALLY REQUESTED.

**Preserve User Content**: If the input prompt includes extensive guidelines or examples, preserve them entirely or as closely as possible. Keep any details, guidelines, examples, variables, or placeholders provided by the user.

**Constants**: DO include constants in the prompt (guides, rubrics, examples) as they are not susceptible to prompt injection.

**Output Format**: Explicitly specify the most appropriate output format in detail, including length and syntax (e.g., short sentence, paragraph, JSON, etc.). For tasks outputting well-defined or structured data (classification, JSON, etc.), bias toward JSON output. JSON should never be wrapped in code blocks unless explicitly requested.

Structure for Improved Prompts:

Your improved prompt should follow this structure:

1. [Concise instruction describing the task - first line, no section header]
2. [Additional details as needed]
3. [Optional sections with headings or bullet points for detailed steps]

## Steps [optional]
[A detailed breakdown of steps necessary to accomplish the task]

## Output Format
[Specifically call out how the output should be formatted: response length, structure (JSON, markdown, etc.)]

## Examples [optional]
[1-3 well-defined examples with placeholders if necessary. Clearly mark where examples start and end, and what the input and output are. If examples are shorter/longer than realistic ones, note this with ()]

## Notes [optional]
[Edge cases, important details, and specific considerations to call out]

CRITICAL: Output ONLY the improved prompt. Do not include any preamble, explanation, commentary, or meta-discussion. Do not include "---" separators or messages like "Here is the improved prompt:". Start directly with the improved prompt content.`;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { prompt, model = "anthropic/claude-haiku-4.5" } = body;

    if (!prompt || typeof prompt !== "string") {
      return new Response(
        JSON.stringify({ error: "Prompt is required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    console.log("🔧 Improving prompt with model:", model);

    const result = await generateText({
      model: model,
      system: PROMPT_IMPROVEMENT_SYSTEM,
      prompt: `Here is the prompt to improve:

<original_prompt>
${prompt}
</original_prompt>

Analyze this prompt and rewrite it to be more effective by applying prompt engineering best practices. Focus on clarity, structure, and specificity while preserving the original intent.`,
      maxTokens: 4000,
    });

    const improvedPrompt = result.text.trim();

    console.log("✅ Prompt improved successfully");

    return new Response(
      JSON.stringify({ improvedPrompt }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("❌ Error improving prompt:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to improve prompt",
        details: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
