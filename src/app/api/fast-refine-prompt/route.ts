import { generateText } from "ai";

export const maxDuration = 30;

interface RefineRequest {
  winningPrompt: string;
  userComment?: string;
  reflectionModel?: string;
}

/**
 * Fast refinement endpoint for post-vote prompt improvement
 * Much faster than full group analysis - just refines the winning variant
 * based on user's comment and recent context
 */
export async function POST(req: Request) {
  try {
    const body: RefineRequest = await req.json();
    const { winningPrompt, userComment, reflectionModel = "anthropic/claude-haiku-4.5" } = body;

    if (!winningPrompt) {
      return new Response(
        JSON.stringify({ error: "winningPrompt is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // If no comment, just return the winning prompt as-is
    if (!userComment?.trim()) {
      return new Response(
        JSON.stringify({
          refinedPrompt: winningPrompt,
          wasRefined: false,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Fast refinement based on user comment
    const refinementPrompt = `You are an expert prompt engineer. A user just provided feedback on an AI assistant's response. Your task is to refine the SYSTEM PROMPT (not generate a response) to address their feedback.

CURRENT SYSTEM PROMPT:
"""
${winningPrompt}
"""

USER'S FEEDBACK ABOUT THE RESPONSE:
"${userComment}"

CRITICAL INSTRUCTIONS:
1. You are modifying a SYSTEM PROMPT that instructs an AI assistant
2. PRESERVE all existing instructions, capabilities, and tone from the current prompt
3. ADD or MODIFY only the specific aspect mentioned in the user's feedback
4. DO NOT replace the entire prompt - only make targeted additions/changes
5. The user's comment is about how the assistant RESPONDED, so adjust the prompt to change future responses

EXAMPLE:
If feedback is "the assistant should be called Botbot", ADD: "Introduce yourself as Botbot when asked for your name."
If feedback is "avoid markdown", ADD: "Present information in plain text without markdown formatting."
If feedback is "be more concise", ADD: "Keep responses concise and to the point."

Return ONLY the refined system prompt (with existing content preserved + your additions), nothing else.`;

    console.log("[FastRefine] Refining prompt based on comment:", userComment);

    const result = await generateText({
      model: reflectionModel,
      prompt: refinementPrompt,
    });

    const refinedPrompt = result.text.trim();

    console.log("[FastRefine] Refinement complete");

    return new Response(
      JSON.stringify({
        refinedPrompt,
        wasRefined: true,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[FastRefine] Error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Failed to refine prompt",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
