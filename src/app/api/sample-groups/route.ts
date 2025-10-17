import { getDataDirectory } from "@/lib/config-loader";
import { promises as fs } from "fs";
import { nanoid } from "nanoid";
import * as path from "path";

// Migration: Read prompt.md and move content to default group
async function migratePromptToGroups(data: SamplesData): Promise<boolean> {
  let migrated = false;

  // Check if any group already has a prompt (migration already done)
  const hasPrompts = data.groups.some((g) => g.prompt !== undefined);
  if (hasPrompts) {
    return false; // Already migrated
  }

  // Try to read existing prompt.md
  const promptPath = path.join(getDataDirectory(), "prompt.md");
  try {
    const promptContent = await fs.readFile(promptPath, "utf-8");

    // Assign to default group
    const defaultGroup = data.groups.find((g) => g.id === "default");
    if (defaultGroup) {
      defaultGroup.prompt = promptContent;
      defaultGroup.chatHistory = []; // Initialize empty chat history
      migrated = true;

      // Backup original prompt.md
      const backupPath = path.join(getDataDirectory(), "prompt.md.backup");
      await fs.writeFile(backupPath, promptContent, "utf-8");

      console.log("[Migration] Moved prompt.md to default group, created backup");
    }

    // Initialize prompt and chatHistory for all other groups
    data.groups.forEach((group) => {
      if (group.id !== "default") {
        group.prompt = group.prompt || "";
        group.chatHistory = group.chatHistory || [];
      }
    });
  } catch (error) {
    // No prompt.md exists, initialize all groups with empty prompts
    data.groups.forEach((group) => {
      group.prompt = group.prompt || "";
      group.chatHistory = group.chatHistory || [];
    });
  }

  return migrated;
}

function getSamplesFile() {
  return path.join(getDataDirectory(), "samples.json");
}

export interface SampleGroup {
  id: string;
  name: string;
  timestamp: string;
  samples: any[];
  prompt?: string; // Per-group system prompt
  chatHistory?: any[]; // Per-group chat messages
}

export interface SamplesData {
  groups: SampleGroup[];
  currentGroupId: string;
}

async function loadSamplesData(): Promise<SamplesData> {
  try {
    const samplesFile = getSamplesFile();
    const data = await fs.readFile(samplesFile, "utf-8");
    const samplesData = JSON.parse(data);

    // Run migration if needed
    const migrated = await migratePromptToGroups(samplesData);
    if (migrated) {
      // Save migrated data
      await saveSamplesData(samplesData);
    }

    return samplesData;
  } catch {
    // Create default group with empty prompt and chat history
    return {
      groups: [
        {
          id: "default",
          name: "Default Group",
          timestamp: new Date().toISOString(),
          samples: [],
          prompt: "",
          chatHistory: [],
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

// GET /api/sample-groups - List all groups
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const groupId = url.searchParams.get("id");

    const data = await loadSamplesData();

    if (groupId) {
      // Return specific group
      const group = data.groups.find((g) => g.id === groupId);
      if (!group) {
        return Response.json({ error: "Group not found" }, { status: 404 });
      }
      return Response.json({ group, currentGroupId: data.currentGroupId });
    }

    // Return all groups
    return Response.json({
      groups: data.groups,
      currentGroupId: data.currentGroupId,
    });
  } catch (error) {
    console.error("Error loading sample groups:", error);
    return Response.json(
      { error: "Failed to load sample groups" },
      { status: 500 }
    );
  }
}

// POST /api/sample-groups - Create a new group
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== "string") {
      return Response.json(
        { error: "Group name is required" },
        { status: 400 }
      );
    }

    const data = await loadSamplesData();

    const newGroup: SampleGroup = {
      id: nanoid(),
      name,
      timestamp: new Date().toISOString(),
      samples: [],
      prompt: "", // Initialize with empty prompt
      chatHistory: [], // Initialize with empty chat history
    };

    data.groups.push(newGroup);
    data.currentGroupId = newGroup.id; // Set as current group

    await saveSamplesData(data);

    return Response.json({ success: true, group: newGroup });
  } catch (error) {
    console.error("Error creating sample group:", error);
    return Response.json(
      { error: "Failed to create sample group" },
      { status: 500 }
    );
  }
}

// PUT /api/sample-groups - Update current group
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { currentGroupId } = body;

    if (!currentGroupId) {
      return Response.json({ error: "Group ID is required" }, { status: 400 });
    }

    const data = await loadSamplesData();

    // Verify group exists
    const group = data.groups.find((g) => g.id === currentGroupId);
    if (!group) {
      return Response.json({ error: "Group not found" }, { status: 404 });
    }

    data.currentGroupId = currentGroupId;
    await saveSamplesData(data);

    return Response.json({ success: true, currentGroupId });
  } catch (error) {
    console.error("Error updating current group:", error);
    return Response.json(
      { error: "Failed to update current group" },
      { status: 500 }
    );
  }
}

// DELETE /api/sample-groups?id=<groupId> - Delete a group
export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const groupId = url.searchParams.get("id");

    if (!groupId) {
      return Response.json({ error: "Group ID required" }, { status: 400 });
    }

    if (groupId === "default") {
      return Response.json(
        { error: "Cannot delete default group" },
        { status: 400 }
      );
    }

    const data = await loadSamplesData();

    const groupIndex = data.groups.findIndex((g) => g.id === groupId);
    if (groupIndex === -1) {
      return Response.json({ error: "Group not found" }, { status: 404 });
    }

    data.groups.splice(groupIndex, 1);

    // If current group was deleted, switch to default
    if (data.currentGroupId === groupId) {
      data.currentGroupId = data.groups[0]?.id || "default";
    }

    await saveSamplesData(data);

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error deleting sample group:", error);
    return Response.json(
      { error: "Failed to delete sample group" },
      { status: 500 }
    );
  }
}
