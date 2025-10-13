/* eslint-disable @typescript-eslint/no-explicit-any */
import { gateway } from "@ai-sdk/gateway";

export const runtime = "nodejs";

export async function GET() {
  try {
    const available = await gateway.getAvailableModels();

    // Minimal projection for the UI
    const models = (available.models || []).map((m) => ({
      id: m.id,
      name: m.name ?? m.id,
      description: m.description ?? null,
      modelType: (m as any).modelType ?? (m as any).type ?? "language",
      pricing: (m as any).pricing ?? null,
    }));

    return new Response(
      JSON.stringify({
        models,
        textModels: models.filter((m) => m.modelType === "language"),
        embeddingModels: models.filter((m) => m.modelType === "embedding"),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
