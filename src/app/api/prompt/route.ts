import { getDataDirectory } from "@/lib/config-loader";
import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";

interface SampleGroup {
  id: string;
  name: string;
  timestamp: string;
  samples: any[];
  prompt?: string;
  chatHistory?: any[];
}

interface SamplesData {
  groups: SampleGroup[];
  currentGroupId: string;
}

function getSamplesFile() {
  return path.join(getDataDirectory(), "samples.json");
}

async function loadSamplesData(): Promise<SamplesData> {
  const samplesFile = getSamplesFile();
  const data = await fs.readFile(samplesFile, "utf-8");
  return JSON.parse(data);
}

async function saveSamplesData(data: SamplesData): Promise<void> {
  const samplesFile = getSamplesFile();
  await fs.writeFile(samplesFile, JSON.stringify(data, null, 2));
}

export async function GET() {
  try {
    const data = await loadSamplesData();
    const currentGroup = data.groups.find((g) => g.id === data.currentGroupId);

    if (!currentGroup) {
      return new Response(
        JSON.stringify({ error: "Current group not found" }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({ prompt: currentGroup.prompt || "" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error reading prompt:", error);
    return new Response(JSON.stringify({ error: "Failed to load prompt" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const prompt = json.prompt;

    if (typeof prompt !== "string") {
      throw new Error("Invalid prompt: must be a string");
    }

    const data = await loadSamplesData();
    const currentGroup = data.groups.find((g) => g.id === data.currentGroupId);

    if (!currentGroup) {
      return new Response(
        JSON.stringify({ error: "Current group not found" }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Update the current group's prompt
    currentGroup.prompt = prompt;
    await saveSamplesData(data);

    return new Response(JSON.stringify({ success: true, prompt }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Error saving prompt:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
}
