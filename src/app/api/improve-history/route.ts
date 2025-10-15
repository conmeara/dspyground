import { getDataDirectory } from "@/lib/config-loader";
import { promises as fs } from "fs";
import * as path from "path";

interface ImproveHistoryEntry {
  timestamp: string;
  seedPrompt: string;
  variantAPrompt: string;
  variantBPrompt: string;
  variantAStrategy: string;
  variantBStrategy: string;
  winner?: "A" | "B" | "tie" | "both-bad";
}

interface SampleGroup {
  id: string;
  name: string;
  samples: any[];
  createdAt: string;
  improveHistory?: ImproveHistoryEntry[];
}

interface SamplesData {
  groups: SampleGroup[];
  currentGroupId: string;
}

function getSamplesFile() {
  return path.join(getDataDirectory(), "samples.json");
}

async function loadSamplesData(): Promise<SamplesData> {
  try {
    const samplesFile = getSamplesFile();
    const data = await fs.readFile(samplesFile, "utf-8");
    return JSON.parse(data);
  } catch {
    return {
      groups: [
        {
          id: "default",
          name: "Default",
          samples: [],
          createdAt: new Date().toISOString(),
        },
      ],
      currentGroupId: "default",
    };
  }
}

async function saveSamplesData(data: SamplesData): Promise<void> {
  const samplesFile = getSamplesFile();
  await fs.writeFile(samplesFile, JSON.stringify(data, null, 2));
}

// POST /api/improve-history - Add new improve history entry
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      seedPrompt,
      variantAPrompt,
      variantBPrompt,
      variantAStrategy,
      variantBStrategy,
      winner,
    } = body;

    if (!seedPrompt || !variantAPrompt || !variantBPrompt) {
      return Response.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const data = await loadSamplesData();
    const currentGroup = data.groups.find(
      (g) => g.id === data.currentGroupId
    );

    if (!currentGroup) {
      return Response.json(
        { error: "Current group not found" },
        { status: 404 }
      );
    }

    // Initialize improveHistory if it doesn't exist
    if (!currentGroup.improveHistory) {
      currentGroup.improveHistory = [];
    }

    // Add new entry
    const newEntry: ImproveHistoryEntry = {
      timestamp: new Date().toISOString(),
      seedPrompt,
      variantAPrompt,
      variantBPrompt,
      variantAStrategy: variantAStrategy || "Variant A strategy",
      variantBStrategy: variantBStrategy || "Variant B strategy",
      winner,
    };

    currentGroup.improveHistory.push(newEntry);

    await saveSamplesData(data);

    console.log(
      `[ImproveHistory] Added entry to group ${currentGroup.id}, winner: ${winner || "pending"}`
    );

    return Response.json({ success: true, entry: newEntry });
  } catch (error) {
    console.error("Error saving improve history:", error);
    return Response.json(
      { error: "Failed to save improve history" },
      { status: 500 }
    );
  }
}

// GET /api/improve-history - Get improve history for current group
export async function GET(request: Request) {
  try {
    const data = await loadSamplesData();
    const currentGroup = data.groups.find(
      (g) => g.id === data.currentGroupId
    );

    if (!currentGroup) {
      return Response.json(
        { error: "Current group not found" },
        { status: 404 }
      );
    }

    return Response.json({
      history: currentGroup.improveHistory || [],
      groupId: currentGroup.id,
      groupName: currentGroup.name,
    });
  } catch (error) {
    console.error("Error loading improve history:", error);
    return Response.json(
      { error: "Failed to load improve history" },
      { status: 500 }
    );
  }
}
