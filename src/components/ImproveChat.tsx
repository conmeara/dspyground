"use client";

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
} from "@/components/ai-elements/conversation";
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
import { FeedbackDialog } from "@/components/ui/feedback-dialog";
import { type VoteChoice, VotingButtons } from "@/components/ui/voting-buttons";
import { useChat } from "@ai-sdk/react";
import { MessageSquare } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

interface ImproveChatProps {
  selectedModel: string;
  onModelChange: (model: string) => void;
  textModels: Array<{ id: string; name: string }>;
  preferencesLoaded: boolean;
  reflectionModel?: string;
}

type ImproveRound = {
  userMessage: string;
  variantA: string;
  variantB: string;
  responseA: string;
  responseB: string;
  streamingA: boolean;
  streamingB: boolean;
  votingEnabled: boolean;
};

export function ImproveChat({
  selectedModel,
  onModelChange,
  textModels,
  preferencesLoaded,
  reflectionModel = "openai/gpt-4o",
}: ImproveChatProps) {
  const [currentRound, setCurrentRound] = useState<ImproveRound | null>(null);
  const [history, setHistory] = useState<ImproveRound[]>([]);
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false);
  const [pendingVote, setPendingVote] = useState<VoteChoice | null>(null);
  const [savingSample, setSavingSample] = useState(false);
  const [isGeneratingVariants, setIsGeneratingVariants] = useState(false);

  const handleSubmit = useCallback(
    async (message: { text?: string; files?: unknown[] }) => {
      const text = message.text?.trim();
      if (!text) return;

      try {
        setIsGeneratingVariants(true);

        // Generate prompt variants
        const variantsResponse = await fetch("/api/generate-prompt-variants", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reflectionModel }),
        });

        if (!variantsResponse.ok) {
          throw new Error("Failed to generate variants");
        }

        const { variantA, variantB } = await variantsResponse.json();

        // Initialize new round
        const newRound: ImproveRound = {
          userMessage: text,
          variantA,
          variantB,
          responseA: "",
          responseB: "",
          streamingA: true,
          streamingB: true,
          votingEnabled: false,
        };

        setCurrentRound(newRound);
        setIsGeneratingVariants(false);

        // Stream response A
        const streamA = async () => {
          try {
            const response = await fetch(
              `/api/chat?model=${encodeURIComponent(selectedModel)}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  messages: [
                    {
                      id: "user-1",
                      role: "user",
                      parts: [{ type: "text", text }],
                    },
                  ],
                  systemPrompt: variantA,
                }),
              }
            );

            if (!response.ok) {
              throw new Error(`Stream A failed: ${response.status}`);
            }

            const reader = response.body?.getReader();
            if (!reader) {
              throw new Error("No reader available for stream A");
            }

            const decoder = new TextDecoder();
            let buffer = "";
            let accumulatedText = "";

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");

              // Keep the last incomplete line in the buffer
              buffer = lines.pop() || "";

              for (const line of lines) {
                if (!line.trim()) continue;

                // Skip [DONE] marker
                if (line.includes("[DONE]")) continue;

                // SSE format: "data: {...}"
                if (line.startsWith("data: ")) {
                  const jsonStr = line.slice(6); // Remove "data: " prefix

                  try {
                    const event = JSON.parse(jsonStr);

                    // Accumulate text deltas
                    if (event.type === "text-delta" && event.delta) {
                      accumulatedText += event.delta;
                      setCurrentRound((prev) =>
                        prev ? { ...prev, responseA: accumulatedText } : prev
                      );
                    }
                  } catch (e) {
                    // Ignore parse errors for non-JSON lines
                  }
                }
              }
            }
          } catch (error) {
            console.error("[ImproveChat] Stream A error:", error);
            toast.error("Failed to generate Response A");
            setCurrentRound((prev) =>
              prev
                ? { ...prev, responseA: "Error generating response", streamingA: false }
                : prev
            );
          } finally {
            setCurrentRound((prev) =>
              prev ? { ...prev, streamingA: false } : prev
            );
          }
        };

        // Stream response B
        const streamB = async () => {
          try {
            const response = await fetch(
              `/api/chat?model=${encodeURIComponent(selectedModel)}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  messages: [
                    {
                      id: "user-1",
                      role: "user",
                      parts: [{ type: "text", text }],
                    },
                  ],
                  systemPrompt: variantB,
                }),
              }
            );

            if (!response.ok) {
              throw new Error(`Stream B failed: ${response.status}`);
            }

            const reader = response.body?.getReader();
            if (!reader) {
              throw new Error("No reader available for stream B");
            }

            const decoder = new TextDecoder();
            let buffer = "";
            let accumulatedText = "";

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");

              // Keep the last incomplete line in the buffer
              buffer = lines.pop() || "";

              for (const line of lines) {
                if (!line.trim()) continue;

                // Skip [DONE] marker
                if (line.includes("[DONE]")) continue;

                // SSE format: "data: {...}"
                if (line.startsWith("data: ")) {
                  const jsonStr = line.slice(6); // Remove "data: " prefix

                  try {
                    const event = JSON.parse(jsonStr);

                    // Accumulate text deltas
                    if (event.type === "text-delta" && event.delta) {
                      accumulatedText += event.delta;
                      setCurrentRound((prev) =>
                        prev ? { ...prev, responseB: accumulatedText } : prev
                      );
                    }
                  } catch (e) {
                    // Ignore parse errors for non-JSON lines
                  }
                }
              }
            }
          } catch (error) {
            console.error("[ImproveChat] Stream B error:", error);
            toast.error("Failed to generate Response B");
            setCurrentRound((prev) =>
              prev
                ? { ...prev, responseB: "Error generating response", streamingB: false }
                : prev
            );
          } finally {
            setCurrentRound((prev) =>
              prev ? { ...prev, streamingB: false } : prev
            );
          }
        };

        // Start both streams in parallel
        await Promise.all([streamA(), streamB()]);

        // Enable voting when both complete
        setCurrentRound((prev) =>
          prev ? { ...prev, votingEnabled: true } : prev
        );
      } catch (error) {
        console.error("Error in improve mode:", error);
        toast.error("Failed to generate responses");
        setCurrentRound(null);
        setIsGeneratingVariants(false);
      }
    },
    [selectedModel, reflectionModel]
  );

  const handleVote = useCallback((choice: VoteChoice) => {
    setPendingVote(choice);
    setFeedbackDialogOpen(true);
  }, []);

  const handleSaveWithFeedback = useCallback(
    async (feedback: { rating: "positive" | "negative"; comment?: string }) => {
      if (!currentRound || !pendingVote) return;

      try {
        setSavingSample(true);

        // Map vote to ratings
        const ratingMap: Record<
          VoteChoice,
          { ratingA: "positive" | "negative"; ratingB: "positive" | "negative" }
        > = {
          "a-better": { ratingA: "positive", ratingB: "negative" },
          "b-better": { ratingA: "negative", ratingB: "positive" },
          tie: { ratingA: "positive", ratingB: "positive" },
          "both-bad": { ratingA: "negative", ratingB: "negative" },
        };

        const ratings = ratingMap[pendingVote];

        // Save sample A
        await fetch("/api/samples", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [
              {
                id: `user-${Date.now()}`,
                role: "user",
                parts: [{ type: "text", text: currentRound.userMessage }],
              },
              {
                id: `assistant-${Date.now()}`,
                role: "assistant",
                parts: [{ type: "text", text: currentRound.responseA }],
              },
            ],
            feedback: {
              rating: ratings.ratingA,
              comment: feedback.comment,
            },
          }),
        });

        // Save sample B
        await fetch("/api/samples", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [
              {
                id: `user-${Date.now()}`,
                role: "user",
                parts: [{ type: "text", text: currentRound.userMessage }],
              },
              {
                id: `assistant-${Date.now()}`,
                role: "assistant",
                parts: [{ type: "text", text: currentRound.responseB }],
              },
            ],
            feedback: {
              rating: ratings.ratingB,
              comment: feedback.comment,
            },
          }),
        });

        // Update prompt with winner (if applicable)
        if (pendingVote === "a-better") {
          await fetch("/api/prompt", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: currentRound.variantA }),
          });
        } else if (pendingVote === "b-better") {
          await fetch("/api/prompt", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: currentRound.variantB }),
          });
        }

        toast.success("Samples saved successfully");

        // Move current round to history
        setHistory((prev) => [...prev, currentRound]);
        setCurrentRound(null);
        setPendingVote(null);
        setFeedbackDialogOpen(false);
      } catch (error) {
        console.error("Error saving samples:", error);
        toast.error("Failed to save samples");
      } finally {
        setSavingSample(false);
      }
    },
    [currentRound, pendingVote]
  );

  const getVoteMessage = () => {
    if (!pendingVote) return "";
    const messages: Record<VoteChoice, string> = {
      "a-better": "You selected: Response A is better",
      "b-better": "You selected: Response B is better",
      tie: "You selected: Both responses are equally good",
      "both-bad": "You selected: Both responses need improvement",
    };
    return messages[pendingVote];
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0 overflow-hidden">
        <div className="h-full flex flex-col px-6">
          <Conversation className="flex-1 min-h-0">
            <ConversationContent>
              {!currentRound && history.length === 0 ? (
                <ConversationEmptyState
                  icon={<MessageSquare className="size-12" />}
                  title="Improve Mode"
                  description="Each message generates two prompt variants for comparison"
                />
              ) : (
                <div className="space-y-8">
                  {/* History */}
                  {history.map((round, idx) => (
                    <div key={idx} className="space-y-4">
                      <Message from="user">
                        <MessageContent>
                          <Response>{round.userMessage}</Response>
                        </MessageContent>
                      </Message>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="border rounded-lg p-4">
                          <div className="text-xs font-medium text-muted-foreground mb-2">
                            Response A
                          </div>
                          <div className="text-sm">{round.responseA}</div>
                        </div>
                        <div className="border rounded-lg p-4">
                          <div className="text-xs font-medium text-muted-foreground mb-2">
                            Response B
                          </div>
                          <div className="text-sm">{round.responseB}</div>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Current Round */}
                  {currentRound && (
                    <div className="space-y-4">
                      <Message from="user">
                        <MessageContent>
                          <Response>{currentRound.userMessage}</Response>
                        </MessageContent>
                      </Message>

                      <div className="space-y-4">
                        {/* Response A */}
                        <div className="border-2 rounded-lg p-4 bg-card">
                          <div className="text-sm font-semibold mb-3 flex items-center justify-between">
                            <span>Response A</span>
                            {currentRound.streamingA && (
                              <span className="text-xs text-muted-foreground">
                                Streaming...
                              </span>
                            )}
                          </div>
                          <div className="text-sm whitespace-pre-wrap">
                            {currentRound.responseA || (
                              <span className="text-muted-foreground">
                                Waiting for response...
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Response B */}
                        <div className="border-2 rounded-lg p-4 bg-card">
                          <div className="text-sm font-semibold mb-3 flex items-center justify-between">
                            <span>Response B</span>
                            {currentRound.streamingB && (
                              <span className="text-xs text-muted-foreground">
                                Streaming...
                              </span>
                            )}
                          </div>
                          <div className="text-sm whitespace-pre-wrap">
                            {currentRound.responseB || (
                              <span className="text-muted-foreground">
                                Waiting for response...
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Voting Buttons */}
                        {currentRound.votingEnabled && (
                          <VotingButtons
                            onVote={handleVote}
                            disabled={savingSample}
                          />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </ConversationContent>
          </Conversation>
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
                disabled={!!currentRound || isGeneratingVariants}
              />
            </PromptInputBody>
            <PromptInputToolbar>
              <PromptInputTools>
                {preferencesLoaded && selectedModel ? (
                  <PromptInputModelSelect
                    value={selectedModel}
                    onValueChange={onModelChange}
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
                <PromptInputSubmit
                  status={currentRound || isGeneratingVariants ? "streaming" : "ready"}
                  disabled={!!currentRound || isGeneratingVariants}
                />
              </div>
            </PromptInputToolbar>
          </PromptInput>
        </div>
      </div>

      {/* Feedback Dialog */}
      <FeedbackDialog
        open={feedbackDialogOpen}
        onOpenChange={setFeedbackDialogOpen}
        onSave={handleSaveWithFeedback}
        isSaving={savingSample}
        autoMessage={getVoteMessage()}
      />
    </div>
  );
}
