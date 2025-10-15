"use client";

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { ImproveChat } from "@/components/ImproveChat";
import { Message, MessageContent } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  PromptInputModelSelect,
  PromptInputModelSelectContent,
  PromptInputModelSelectItem,
  PromptInputModelSelectTrigger,
  PromptInputModelSelectValue,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { Response } from "@/components/ai-elements/response";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FeedbackDialog } from "@/components/ui/feedback-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useChat, experimental_useObject as useObject } from "@ai-sdk/react";
import { DefaultChatTransport, type ToolUIPart } from "ai";
import {
  BookOpen,
  Database,
  MessageSquare,
  Plus,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

type GatewayModel = {
  id: string;
  name: string;
  description: string | null;
  modelType: string;
};

// Schema for structured output - matches data/schema.json
const structuredOutputSchema = z.object({
  response: z.string().optional(),
  next_agent: z.enum(["planner", "router"]).optional(),
  next_agent_app_names: z.array(z.string()).optional(),
  task_description: z.string().optional(),
  task_completed: z.boolean().optional(),
  cancel_current_request: z.boolean().optional(),
});

export default function Chat() {
  const [improveMode, setImproveMode] = useState(true);
  const [useStructuredOutput, setUseStructuredOutput] = useState(false);
  const [selectedModel, setSelectedModelState] = useState<string>("");
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [textModels, setTextModels] = useState<GatewayModel[]>([]);
  const [savingSample, setSavingSample] = useState(false);
  const [currentPrompt, setCurrentPrompt] = useState<string>("");
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false);
  const [sampleGroups, setSampleGroups] = useState<any[]>([]);
  const [currentGroupId, setCurrentGroupId] = useState<string>("");
  const [newGroupDialogOpen, setNewGroupDialogOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [schemaEditorOpen, setSchemaEditorOpen] = useState(false);
  const [schemaContent, setSchemaContent] = useState<string>("");
  const [promptEditorContent, setPromptEditorContent] = useState<string>("");
  const [isLoadingPrompt, setIsLoadingPrompt] = useState(false);
  const [isSavingPrompt, setIsSavingPrompt] = useState(false);
  const [runs, setRuns] = useState<any[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>("");
  const [isRefiningPrompt, setIsRefiningPrompt] = useState(false);
  const [showPromptFlash, setShowPromptFlash] = useState(false);
  const [isImprovingPrompt, setIsImprovingPrompt] = useState(false);

  // Wrap setSelectedModel to prevent empty values
  const setSelectedModel = useCallback(
    (value: string | ((prev: string) => string)) => {
      const newValue =
        typeof value === "function" ? value(selectedModel) : value;
      if (!newValue || !newValue.trim()) {
        return;
      }
      setSelectedModelState(newValue);
    },
    [selectedModel]
  );

  // Build API URL with current parameters
  const chatApiUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (selectedModel) params.set("model", selectedModel);
    return params.toString() ? `/api/chat?${params.toString()}` : "/api/chat";
  }, [selectedModel]);

  const structuredApiUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set("structured", "true");
    if (selectedModel) params.set("model", selectedModel);
    return `/api/chat?${params.toString()}`;
  }, [selectedModel]);

  // Hook for text chat
  const { messages, sendMessage, setMessages, status, stop } = useChat({
    id: "chat-text",
    transport: new DefaultChatTransport({
      api: chatApiUrl,
    }),
    onError: (error) => {
      console.error("Chat error:", error);
      toast.error("Chat error: " + error.message);
    },
  });

  // Hook for structured output
  const {
    object,
    submit,
    isLoading: isObjectLoading,
    stop: stopObject,
  } = useObject({
    api: structuredApiUrl,
    schema: structuredOutputSchema,
    fetch: async (url, options) => {
      // Custom fetch to send prompt in the correct format
      const body = options?.body ? JSON.parse(options.body as string) : {};
      const customBody = {
        prompt: body.prompt || body.input || "",
      };

      return fetch(url, {
        ...options,
        body: JSON.stringify(customBody),
      });
    },
    onError: (error) => {
      console.error("Structured output error:", error);
      toast.error("Error generating structured output");
    },
  });

  // Load preferences on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/preferences", { cache: "no-store" });
        if (res.ok) {
          const prefs = (await res.json()) as {
            selectedModel?: string;
            useStructuredOutput?: boolean;
          };

          if (prefs.selectedModel && prefs.selectedModel.trim()) {
            setSelectedModelState(prefs.selectedModel);

            // Ensure the model is in the textModels list
            setTextModels((prev) => {
              const modelExists = prev.some(
                (m) => m.id === prefs.selectedModel
              );
              if (!modelExists && prefs.selectedModel) {
                return [
                  {
                    id: prefs.selectedModel,
                    name: prefs.selectedModel,
                    description: "From preferences",
                    modelType: "language",
                  },
                  ...prev,
                ];
              }
              return prev;
            });
          } else {
            setSelectedModelState("openai/gpt-4o-mini");
          }

          if (typeof prefs.useStructuredOutput === "boolean")
            setUseStructuredOutput(prefs.useStructuredOutput);
        } else {
          setSelectedModelState("openai/gpt-4o-mini");
        }
      } catch (error) {
        console.error("Failed to load preferences:", error);
        setSelectedModelState("openai/gpt-4o-mini");
      } finally {
        setPreferencesLoaded(true);
      }
    })();
  }, []);

  // Load models
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/models", { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as {
            textModels?: GatewayModel[];
            models?: GatewayModel[];
          };
          const list = (
            data.textModels && Array.isArray(data.textModels)
              ? data.textModels
              : (data.models || []).filter((m) => m.modelType === "language")
          ) as GatewayModel[];
          setTextModels((prev) => {
            const prevModels = prev.filter(
              (pm) => !list.some((m) => m.id === pm.id)
            );
            return [...prevModels, ...list];
          });
        }
      } catch (error) {
        console.error("Failed to load models:", error);
      }
    })();
  }, []);

  // Save preferences when they change
  useEffect(() => {
    if (!preferencesLoaded) return;
    if (!selectedModel || !selectedModel.trim()) return;

    (async () => {
      try {
        await fetch("/api/preferences", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            selectedModel,
            useStructuredOutput,
          }),
        });
      } catch (error) {
        console.error("Error saving preferences:", error);
      }
    })();
  }, [selectedModel, useStructuredOutput, preferencesLoaded]);

  const handleSubmit = async (message: {
    text?: string;
    files?: unknown[];
  }) => {
    const text = message.text?.trim();
    if (!text) return;

    try {
      if (useStructuredOutput) {
        setCurrentPrompt(text);
        submit(text);
      } else {
        sendMessage({ text });
      }
    } catch (error) {
      console.error("Send error:", error);
      toast.error("Failed to send message");
    }
  };

  const handleSaveSample = () => {
    // Validate that there's content to save before opening dialog
    if (useStructuredOutput) {
      if (!currentPrompt || !object) {
        toast.error("No structured output to save");
        return;
      }
    } else {
      if (messages.length === 0) {
        toast.error("No messages to save");
        return;
      }
    }

    // Open feedback dialog
    setFeedbackDialogOpen(true);
  };

  const handleSaveWithFeedback = async (feedback: {
    rating: "positive" | "negative";
    comment?: string;
  }) => {
    try {
      setSavingSample(true);

      let samplesToSave;

      if (useStructuredOutput) {
        samplesToSave = [
          {
            id: `user-${Date.now()}`,
            role: "user",
            parts: [{ type: "text", text: currentPrompt }],
          },
          {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            parts: [{ type: "text", text: JSON.stringify(object, null, 2) }],
          },
        ];
      } else {
        samplesToSave = messages;
      }

      const res = await fetch("/api/samples", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: samplesToSave,
          feedback,
          systemPrompt: promptEditorContent, // Track which prompt generated this sample
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to save sample");
      }

      toast.success("Sample saved successfully");
      setFeedbackDialogOpen(false);
    } catch (error) {
      console.error("Error saving sample:", error);
      toast.error("Failed to save sample");
    } finally {
      setSavingSample(false);
    }
  };

  const handleClear = () => {
    if (useStructuredOutput) {
      setCurrentPrompt("");
      toast.success("Chat cleared");
    } else {
      setMessages([]);
      toast.success("Chat cleared");
    }
  };

  // Determine current status for UI
  const currentStatus = useStructuredOutput
    ? isObjectLoading
      ? "streaming"
      : "ready"
    : status;

  // Load sample groups
  useEffect(() => {
    loadSampleGroups();
    loadSchema();
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const modifierKey = isMac ? e.metaKey : e.ctrlKey;

      // Cmd/Ctrl + A for sampling (add sample)
      if (e.key === "a" && modifierKey) {
        e.preventDefault();
        const canSample =
          (useStructuredOutput && object) ||
          (!useStructuredOutput && messages.length >= 2);
        if (canSample && !savingSample) {
          handleSaveSample();
        }
      }

      // Cmd/Ctrl + C for clearing chat
      if (e.key === "c" && modifierKey) {
        e.preventDefault();
        handleClear();
      }

      // Only trigger arrow shortcuts when not typing in an input/textarea
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // Up arrow for thumbs up
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setFeedbackDialogOpen(true);
        // Auto-select positive feedback
        setTimeout(() => {
          const positiveButton = document.querySelector(
            '[data-feedback="positive"]'
          ) as HTMLButtonElement;
          if (positiveButton) positiveButton.click();
        }, 100);
      }

      // Down arrow for thumbs down
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFeedbackDialogOpen(true);
        // Auto-select negative feedback
        setTimeout(() => {
          const negativeButton = document.querySelector(
            '[data-feedback="negative"]'
          ) as HTMLButtonElement;
          if (negativeButton) negativeButton.click();
        }, 100);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    useStructuredOutput,
    object,
    messages.length,
    savingSample,
    handleSaveSample,
    handleClear,
  ]);

  const loadSampleGroups = async () => {
    try {
      const response = await fetch("/api/sample-groups");
      if (response.ok) {
        const data = await response.json();
        setSampleGroups(data.groups || []);
        setCurrentGroupId(data.currentGroupId || "");
      }
    } catch (error) {
      console.error("Failed to load sample groups:", error);
    }
  };

  const loadSchema = async () => {
    try {
      const response = await fetch("/api/schema");
      if (response.ok) {
        const data = await response.json();
        setSchemaContent(JSON.stringify(data, null, 2));
      }
    } catch (error) {
      console.error("Failed to load schema:", error);
    }
  };

  const handleSaveSchema = async () => {
    try {
      const parsed = JSON.parse(schemaContent);
      const response = await fetch("/api/schema", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });

      if (response.ok) {
        toast.success("Schema saved successfully");
        setSchemaEditorOpen(false);
      } else {
        toast.error("Failed to save schema");
      }
    } catch (error) {
      if (error instanceof SyntaxError) {
        toast.error("Invalid JSON format");
      } else {
        toast.error("Failed to save schema");
      }
    }
  };

  const handleCreateNewGroup = async () => {
    if (!newGroupName.trim()) {
      toast.error("Please enter a group name");
      return;
    }

    try {
      const response = await fetch("/api/sample-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newGroupName.trim() }),
      });

      if (response.ok) {
        toast.success("New sample group created");
        await loadSampleGroups();
        setNewGroupDialogOpen(false);
        setNewGroupName("");
        // Clear chat for new group
        handleClear();
      } else {
        toast.error("Failed to create sample group");
      }
    } catch (error) {
      console.error("Failed to create sample group:", error);
      toast.error("Failed to create sample group");
    }
  };

  const handleGroupChange = async (groupId: string) => {
    // Handle the special "new-group" option
    if (groupId === "new-group") {
      setNewGroupDialogOpen(true);
      return;
    }

    try {
      const response = await fetch("/api/sample-groups", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentGroupId: groupId }),
      });

      if (response.ok) {
        setCurrentGroupId(groupId);
        // Clear chat state when switching groups to maintain session isolation
        handleClear();
        toast.success("Sample group changed");
      } else {
        toast.error("Failed to change sample group");
      }
    } catch (error) {
      console.error("Failed to change sample group:", error);
      toast.error("Failed to change sample group");
    }
  };

  // Determine stop handler based on mode
  const handleStop = useStructuredOutput ? stopObject : stop;

  // Load prompt editor content
  useEffect(() => {
    loadPromptEditorContent();
    loadOptimizationRuns();
  }, [currentGroupId]);

  const loadPromptEditorContent = async () => {
    try {
      setIsLoadingPrompt(true);
      const res = await fetch("/api/prompt");
      if (res.ok) {
        const data = await res.json();
        let prompt = data.prompt || "";

        // Strip markdown code fence syntax if present
        prompt = prompt.replace(/^```(?:markdown|plaintext)?\s*\n?/gm, '');
        prompt = prompt.replace(/\n?```\s*$/gm, '');
        prompt = prompt.trim();

        setPromptEditorContent(prompt);
      }
    } catch (error) {
      console.error("Error loading prompt:", error);
    } finally {
      setIsLoadingPrompt(false);
    }
  };

  // Handle refinement status change from ImproveChat
  const handleRefinementStatusChange = useCallback((isRefining: boolean) => {
    setIsRefiningPrompt(isRefining);

    // If refinement just finished, trigger a quick flash
    if (!isRefining) {
      setShowPromptFlash(true);
      setTimeout(() => setShowPromptFlash(false), 1000);
    }
  }, []);

  const loadOptimizationRuns = async () => {
    try {
      const res = await fetch("/api/runs");
      if (res.ok) {
        const data = await res.json();
        const allRuns = data.runs || [];
        const filteredRuns = currentGroupId
          ? allRuns.filter(
              (run: any) =>
                run.config.sampleGroupId === currentGroupId && run.finalPrompt
            )
          : allRuns.filter((run: any) => run.finalPrompt);
        setRuns(filteredRuns);
      }
    } catch (error) {
      console.error("Error loading runs:", error);
    }
  };

  const handleSelectRun = (runId: string) => {
    setSelectedRunId(runId);
    const selectedRun = runs.find((r) => r.id === runId);
    if (selectedRun) {
      setPromptEditorContent(selectedRun.finalPrompt);
    }
  };

  const handleSavePrompt = async () => {
    try {
      setIsSavingPrompt(true);
      const res = await fetch("/api/prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: promptEditorContent }),
      });

      if (!res.ok) {
        throw new Error("Failed to save prompt");
      }

      toast.success("Prompt saved successfully");
    } catch (error) {
      console.error("Error saving prompt:", error);
      toast.error("Failed to save prompt");
    } finally {
      setIsSavingPrompt(false);
    }
  };

  const handleImprovePrompt = async () => {
    if (!promptEditorContent.trim()) {
      toast.error("Please enter a prompt first");
      return;
    }

    try {
      setIsImprovingPrompt(true);
      const res = await fetch("/api/improve-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: promptEditorContent,
          model: selectedModel || "openai/gpt-4o",
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to improve prompt");
      }

      const data = await res.json();
      setPromptEditorContent(data.improvedPrompt);
      toast.success("Prompt improved successfully");
    } catch (error) {
      console.error("Error improving prompt:", error);
      toast.error(error instanceof Error ? error.message : "Failed to improve prompt");
    } finally {
      setIsImprovingPrompt(false);
    }
  };

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  return (
    <div className="font-sans w-full min-h-[100svh] h-[100svh] overflow-hidden flex flex-col">
      {/* Header */}
      <div className="border-b">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-medium">Agent Chat</h1>
              <ThemeToggle />
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" asChild>
                <Link href="/how-to">
                  <BookOpen className="size-4 mr-2" />
                  How To
                </Link>
              </Button>
              <div className="flex items-center gap-2 px-3 py-1.5 border rounded-md bg-background">
                <span className="text-xs text-muted-foreground">Teaching</span>
                <Switch
                  checked={improveMode}
                  onCheckedChange={setImproveMode}
                />
                <span className="text-xs text-muted-foreground">
                  Improve
                </span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 border rounded-md bg-background">
                <span className="text-xs text-muted-foreground">Text</span>
                <Switch
                  checked={useStructuredOutput}
                  onCheckedChange={setUseStructuredOutput}
                  disabled={improveMode}
                />
                <span className="text-xs text-muted-foreground">
                  Structured
                </span>
              </div>
              <Select value={currentGroupId} onValueChange={handleGroupChange}>
                <SelectTrigger className="w-[180px] h-8 text-xs">
                  <SelectValue placeholder="Select group" />
                </SelectTrigger>
                <SelectContent>
                  {sampleGroups.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.name} ({group.samples.length})
                    </SelectItem>
                  ))}
                  <SelectItem value="new-group" className="text-blue-600">
                    <div className="flex items-center gap-1.5">
                      <Plus className="size-3" />
                      <span>New Group</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <Button variant="ghost" size="sm" onClick={handleClear}>
                Clear
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Split View: Prompt Editor + Chat Area */}
      <div className="flex-1 min-h-0 overflow-hidden flex">
        {/* Left: Prompt Editor */}
        <div className="w-1/2 border-r flex flex-col">
          {/* Improve Prompt Button Header */}
          <div className="border-b px-4 py-3 flex items-center justify-between bg-background">
            <h3 className="text-sm font-medium text-muted-foreground">System Prompt</h3>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleImprovePrompt}
                    disabled={isImprovingPrompt || isLoadingPrompt || !promptEditorContent.trim()}
                    className="h-8"
                  >
                    <Sparkles className="size-4 mr-2" />
                    {isImprovingPrompt ? "Improving..." : "Improve Prompt"}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Applies prompt engineering best practices</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="flex-1 min-h-0 p-4">
            {isLoadingPrompt ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                Loading prompt...
              </div>
            ) : (
              <Textarea
                value={promptEditorContent}
                onChange={(e) => setPromptEditorContent(e.target.value)}
                placeholder="Enter your system prompt here..."
                className={`h-full font-mono text-sm resize-none transition-all duration-300 ${
                  isRefiningPrompt || isImprovingPrompt
                    ? "ring-2 ring-blue-400 ring-offset-2 shadow-lg shadow-blue-400/20"
                    : showPromptFlash
                    ? "ring-2 ring-blue-400 ring-offset-2"
                    : ""
                }`}
              />
            )}
          </div>
          <div className="border-t bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
            <div className="px-6 py-4">
              <div className="flex items-center justify-end mb-3">
                <Button
                  size="sm"
                  onClick={handleSavePrompt}
                  disabled={isSavingPrompt || isLoadingPrompt}
                >
                  {isSavingPrompt ? "Saving..." : "Save"}
                </Button>
              </div>
              {runs.length > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="run-select" className="text-xs">
                    Load Optimized Prompt
                    {currentGroupId && (
                      <span className="text-muted-foreground font-normal ml-1">
                        (from current sample group)
                      </span>
                    )}
                  </Label>
                  <Select value={selectedRunId} onValueChange={handleSelectRun}>
                    <SelectTrigger id="run-select" className="h-8 text-xs">
                      <SelectValue placeholder="Select an optimized run..." />
                    </SelectTrigger>
                    <SelectContent>
                      {runs.map((run) => (
                        <SelectItem key={run.id} value={run.id}>
                          {formatDate(run.timestamp)} - Score:{" "}
                          {run.bestScore.toFixed(3)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Chat Area */}
        <div className="w-1/2 flex flex-col">
          {improveMode ? (
            <ImproveChat
              key={currentGroupId} // Force remount when group changes to ensure complete state reset
              selectedModel={selectedModel}
              onModelChange={setSelectedModel}
              textModels={textModels}
              preferencesLoaded={preferencesLoaded}
              onPromptUpdate={loadPromptEditorContent}
              onChatReset={() => {
                // Optional: Add any additional reset logic here
                console.log("Chat reset after sample save");
              }}
              onRefinementStatusChange={handleRefinementStatusChange}
            />
          ) : (
            <>
              <div className="flex-1 min-h-0 overflow-hidden">
                <div className="h-full flex flex-col px-6">
                  {useStructuredOutput ? (
                // Structured Output Mode
                <Conversation className="flex-1 min-h-0">
                  <ConversationContent>
                    {!currentPrompt ? (
                      <ConversationEmptyState
                        icon={<MessageSquare className="size-12" />}
                        title="Structured Output Mode"
                        description="Ask a question to generate a structured response"
                      />
                    ) : (
                      <div className="space-y-6">
                        {/* User prompt */}
                        <div className="flex justify-end">
                          <div className="max-w-[80%] bg-primary text-primary-foreground rounded-lg px-4 py-2">
                            <p className="text-sm">{currentPrompt}</p>
                          </div>
                        </div>

                        {/* Assistant response */}
                        {object && (
                          <div className="flex justify-start">
                            <div className="max-w-[80%] space-y-2">
                              <div className="text-[10px] bg-purple-50 text-purple-700 border border-purple-200 rounded px-1.5 py-0.5 inline-block dark:bg-purple-950/30 dark:border-purple-900/40 dark:text-purple-300">
                                Structured Output{" "}
                                {isObjectLoading && "(Generating...)"}
                              </div>
                              <pre className="text-xs whitespace-pre-wrap break-words text-neutral-700 bg-neutral-50 border border-neutral-200 rounded p-4 dark:text-neutral-200 dark:bg-neutral-900 dark:border-neutral-800">
                                {JSON.stringify(object, null, 2)}
                              </pre>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </ConversationContent>
                </Conversation>
              ) : (
                // Text Chat Mode
                <Conversation className="flex-1 min-h-0">
                  <ConversationContent>
                    {messages.length === 0 ? (
                      <ConversationEmptyState
                        icon={<MessageSquare className="size-12" />}
                        title="Start chatting"
                        description="Ask a question to begin your conversation"
                      />
                    ) : (
                      messages
                        .filter((m) => m.role !== "system")
                        .map((message) => (
                          <Message from={message.role} key={message.id}>
                            <MessageContent>
                              {message.parts.map((part, i) => {
                                if (part.type === "text") {
                                  const text =
                                    (part as { text?: string }).text ?? "";
                                  return <Response key={i}>{text}</Response>;
                                }

                                // Render tool calls
                                if (part.type.startsWith("tool-")) {
                                  const toolPart = part as ToolUIPart;
                                  const isCompleted =
                                    toolPart.state === "output-available" ||
                                    toolPart.state === "output-error";

                                  return (
                                    <Tool key={i} defaultOpen={isCompleted}>
                                      <ToolHeader
                                        type={toolPart.type}
                                        state={toolPart.state}
                                      />
                                      <ToolContent>
                                        <ToolInput input={toolPart.input} />
                                        {(toolPart.state === "output-available" ||
                                          toolPart.state === "output-error") && (
                                          <ToolOutput
                                            output={toolPart.output}
                                            errorText={toolPart.errorText}
                                          />
                                        )}
                                      </ToolContent>
                                    </Tool>
                                  );
                                }

                                return null;
                              })}
                            </MessageContent>
                          </Message>
                        ))
                    )}
                  </ConversationContent>
                  <ConversationScrollButton />
                </Conversation>
              )}
            </div>
          </div>

          {/* Input Area */}
          <div className="border-t bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
            <div className="px-6 py-4">
              <PromptInput onSubmit={handleSubmit}>
                <PromptInputBody>
                  <PromptInputTextarea
                    placeholder="Type your message..."
                    className="min-h-[44px] max-h-[200px]"
                  />
                </PromptInputBody>
                <PromptInputToolbar>
                  <PromptInputTools>
                    {preferencesLoaded && selectedModel ? (
                      <PromptInputModelSelect
                        value={selectedModel}
                        onValueChange={setSelectedModel}
                      >
                        <PromptInputModelSelectTrigger>
                          <PromptInputModelSelectValue />
                        </PromptInputModelSelectTrigger>
                        <PromptInputModelSelectContent>
                          {textModels.length > 0 ? (
                            textModels.map((m) => (
                              <PromptInputModelSelectItem key={m.id} value={m.id}>
                                {m.name}
                              </PromptInputModelSelectItem>
                            ))
                          ) : (
                            <PromptInputModelSelectItem value={selectedModel}>
                              {selectedModel}
                            </PromptInputModelSelectItem>
                          )}
                        </PromptInputModelSelectContent>
                      </PromptInputModelSelect>
                    ) : (
                      <div className="text-xs text-muted-foreground px-2">
                        Loading models...
                      </div>
                    )}
                  </PromptInputTools>
                  <div className="flex items-center gap-1 ml-auto">
                    <TooltipProvider>
                      {useStructuredOutput && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setSchemaEditorOpen(true)}
                              className="h-8"
                            >
                              <Database className="size-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Edit output schema</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={handleSaveSample}
                            disabled={
                              (useStructuredOutput && !object) ||
                              (!useStructuredOutput && messages.length < 2) ||
                              savingSample
                            }
                            className="h-8"
                          >
                            <Plus className="size-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Save as sample</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <PromptInputSubmit
                      status={currentStatus === "streaming" ? "streaming" : "ready"}
                      onClick={
                        currentStatus === "streaming"
                          ? (e) => {
                              e.preventDefault();
                              handleStop();
                            }
                          : undefined
                      }
                    />
                  </div>
                </PromptInputToolbar>
              </PromptInput>
            </div>
          </div>
            </>
          )}
        </div>
      </div>

      {/* Feedback Dialog */}
      <FeedbackDialog
        open={feedbackDialogOpen}
        onOpenChange={setFeedbackDialogOpen}
        onSave={handleSaveWithFeedback}
        isSaving={savingSample}
      />

      {/* New Group Dialog */}
      <Dialog open={newGroupDialogOpen} onOpenChange={setNewGroupDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Sample Group</DialogTitle>
            <DialogDescription>
              Enter a name for your new sample group. This will help you
              organize different sets of test samples.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="group-name">Group Name</Label>
              <Input
                id="group-name"
                placeholder="e.g., Tone Tests, Safety Tests..."
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleCreateNewGroup();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setNewGroupDialogOpen(false);
                setNewGroupName("");
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateNewGroup}>Create Group</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schema Editor Dialog */}
      <Dialog open={schemaEditorOpen} onOpenChange={setSchemaEditorOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Edit Schema</DialogTitle>
            <DialogDescription>
              Edit the JSON schema for structured output generation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="schema-content">Schema (JSON)</Label>
              <Textarea
                id="schema-content"
                className="font-mono text-xs min-h-[400px]"
                value={schemaContent}
                onChange={(e) => setSchemaContent(e.target.value)}
                placeholder='{"type": "object", "properties": {...}}'
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSchemaEditorOpen(false);
                loadSchema(); // Reset to original schema
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveSchema}>Save Schema</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
