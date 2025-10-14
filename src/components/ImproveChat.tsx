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
import { MessageSquare } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

interface ImproveChatProps {
  selectedModel: string;
  onModelChange: (model: string) => void;
  textModels: Array<{ id: string; name: string }>;
  preferencesLoaded: boolean;
  reflectionModel?: string;
  onPromptUpdate?: () => void;
  onChatReset?: () => void;
}

type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

type Thread = {
  systemPrompt: string;
  messages: ConversationMessage[];
};

export function ImproveChat({
  selectedModel,
  onModelChange,
  textModels,
  preferencesLoaded,
  reflectionModel = "openai/gpt-4o",
  onPromptUpdate,
  onChatReset,
}: ImproveChatProps) {
  const [threadA, setThreadA] = useState<Thread | null>(null);
  const [threadB, setThreadB] = useState<Thread | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isGeneratingVariants, setIsGeneratingVariants] = useState(false);
  const [votingEnabled, setVotingEnabled] = useState(false);
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false);
  const [pendingVote, setPendingVote] = useState<VoteChoice | null>(null);
  const [savingSample, setSavingSample] = useState(false);

  const handleSubmit = useCallback(
    async (message: { text?: string; files?: unknown[] }) => {
      const text = message.text?.trim();
      if (!text) return;

      const isFirstMessage = !threadA || !threadB;

      try {
        setIsStreaming(true);
        setVotingEnabled(false);

        // First message: generate variants and initialize threads
        if (isFirstMessage) {
          setIsGeneratingVariants(true);

          const variantsResponse = await fetch("/api/generate-prompt-variants", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reflectionModel }),
          });

          if (!variantsResponse.ok) {
            throw new Error("Failed to generate variants");
          }

          const { variantA, variantB } = await variantsResponse.json();

          // Initialize threads with system prompts
          setThreadA({
            systemPrompt: variantA,
            messages: [{ role: "user", content: text }],
          });
          setThreadB({
            systemPrompt: variantB,
            messages: [{ role: "user", content: text }],
          });

          setIsGeneratingVariants(false);

          // Stream both responses
          await Promise.all([
            streamResponse("A", variantA, [{ role: "user", content: text }]),
            streamResponse("B", variantB, [{ role: "user", content: text }]),
          ]);
        } else {
          // Subsequent messages: append to existing threads
          const newUserMessage: ConversationMessage = { role: "user", content: text };

          setThreadA((prev) =>
            prev ? { ...prev, messages: [...prev.messages, newUserMessage] } : prev
          );
          setThreadB((prev) =>
            prev ? { ...prev, messages: [...prev.messages, newUserMessage] } : prev
          );

          // Stream both responses with full history
          await Promise.all([
            streamResponse("A", threadA!.systemPrompt, [
              ...threadA!.messages,
              newUserMessage,
            ]),
            streamResponse("B", threadB!.systemPrompt, [
              ...threadB!.messages,
              newUserMessage,
            ]),
          ]);
        }

        // Enable voting after both streams complete
        setVotingEnabled(true);
      } catch (error) {
        console.error("[ImproveChat] Error in handleSubmit:", error);
        toast.error("Failed to generate responses");
        setIsGeneratingVariants(false);
      } finally {
        setIsStreaming(false);
      }
    },
    [selectedModel, reflectionModel, threadA, threadB]
  );

  const streamResponse = async (
    threadId: "A" | "B",
    systemPrompt: string,
    messages: ConversationMessage[]
  ) => {
    try {
      const response = await fetch(
        `/api/chat?model=${encodeURIComponent(selectedModel)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: messages.map((msg, idx) => ({
              id: `${msg.role}-${idx}`,
              role: msg.role,
              parts: [{ type: "text", text: msg.content }],
            })),
            systemPrompt,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Stream ${threadId} failed: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error(`No reader available for stream ${threadId}`);
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let accumulatedText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim() || line.includes("[DONE]")) continue;

          if (line.startsWith("data: ")) {
            const jsonStr = line.slice(6);
            try {
              const event = JSON.parse(jsonStr);
              if (event.type === "text-delta" && event.delta) {
                accumulatedText += event.delta;

                // Update appropriate thread with streamed content
                const updateFn = threadId === "A" ? setThreadA : setThreadB;
                updateFn((prev) => {
                  if (!prev) return prev;
                  const lastMessage = prev.messages[prev.messages.length - 1];
                  const isUpdatingLastAssistant =
                    lastMessage?.role === "assistant";

                  if (isUpdatingLastAssistant) {
                    // Update existing assistant message
                    return {
                      ...prev,
                      messages: [
                        ...prev.messages.slice(0, -1),
                        { role: "assistant", content: accumulatedText },
                      ],
                    };
                  } else {
                    // Append new assistant message
                    return {
                      ...prev,
                      messages: [
                        ...prev.messages,
                        { role: "assistant", content: accumulatedText },
                      ],
                    };
                  }
                });
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      }
    } catch (error) {
      console.error(`[ImproveChat] Stream ${threadId} error:`, error);
      toast.error(`Failed to generate Response ${threadId}`);

      const updateFn = threadId === "A" ? setThreadA : setThreadB;
      updateFn((prev) =>
        prev
          ? {
              ...prev,
              messages: [
                ...prev.messages,
                { role: "assistant", content: "Error generating response" },
              ],
            }
          : prev
      );
    }
  };

  const handleVote = useCallback((choice: VoteChoice) => {
    setPendingVote(choice);
    setFeedbackDialogOpen(true);
  }, []);

  const handleSaveWithFeedback = useCallback(
    async (feedback: { rating: "positive" | "negative"; comment?: string }) => {
      if (!threadA || !threadB || !pendingVote) return;

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

        // Convert thread messages to API format
        const convertToApiFormat = (messages: ConversationMessage[]) =>
          messages.map((msg, idx) => ({
            id: `${msg.role}-${Date.now()}-${idx}`,
            role: msg.role,
            parts: [{ type: "text", text: msg.content }],
          }));

        // Save sample A
        await fetch("/api/samples", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: convertToApiFormat(threadA.messages),
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
            messages: convertToApiFormat(threadB.messages),
            feedback: {
              rating: ratings.ratingB,
              comment: feedback.comment,
            },
          }),
        });

        // Update prompt with winner
        try {
          if (pendingVote === "a-better") {
            console.log(
              "[ImproveChat] Updating prompt with variant A:",
              threadA.systemPrompt
            );
            const response = await fetch("/api/prompt", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ prompt: threadA.systemPrompt }),
            });

            if (!response.ok) {
              throw new Error(`Failed to update prompt: ${response.status}`);
            }

            const result = await response.json();
            console.log("[ImproveChat] Prompt updated successfully:", result);
            toast.success("Samples saved and prompt updated with variant A");

            // Notify parent to refresh prompt editor
            onPromptUpdate?.();
          } else if (pendingVote === "b-better") {
            console.log(
              "[ImproveChat] Updating prompt with variant B:",
              threadB.systemPrompt
            );
            const response = await fetch("/api/prompt", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ prompt: threadB.systemPrompt }),
            });

            if (!response.ok) {
              throw new Error(`Failed to update prompt: ${response.status}`);
            }

            const result = await response.json();
            console.log("[ImproveChat] Prompt updated successfully:", result);
            toast.success("Samples saved and prompt updated with variant B");

            // Notify parent to refresh prompt editor
            onPromptUpdate?.();
          } else {
            toast.success("Samples saved successfully");
          }
        } catch (error) {
          console.error("[ImproveChat] Error updating prompt:", error);
          toast.error("Samples saved but failed to update prompt");
        }

        setPendingVote(null);
        setFeedbackDialogOpen(false);

        // Clear threads since new prompt is active
        setThreadA(null);
        setThreadB(null);
        setVotingEnabled(false);

        // Notify parent if needed
        onChatReset?.();
      } catch (error) {
        console.error("[ImproveChat] Error saving samples:", error);
        toast.error("Failed to save samples");
      } finally {
        setSavingSample(false);
      }
    },
    [threadA, threadB, pendingVote, onChatReset]
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

  // Get the number of exchanges in the conversation
  const exchangeCount = threadA
    ? Math.ceil(threadA.messages.filter((m) => m.role === "user").length)
    : 0;

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0 overflow-hidden">
        <div className="h-full flex flex-col px-6">
          <Conversation className="flex-1 min-h-0">
            <ConversationContent>
              {!threadA || !threadB ? (
                <ConversationEmptyState
                  icon={<MessageSquare className="size-12" />}
                  title="Improve Mode"
                  description="Each message generates two prompt variants for side-by-side comparison"
                />
              ) : (
                <div className="space-y-8">
                  {Array.from({ length: exchangeCount }).map((_, exchangeIdx) => {
                    const userMsgA = threadA.messages.filter(
                      (m) => m.role === "user"
                    )[exchangeIdx];
                    const assistantMsgA = threadA.messages.filter(
                      (m) => m.role === "assistant"
                    )[exchangeIdx];
                    const assistantMsgB = threadB.messages.filter(
                      (m) => m.role === "assistant"
                    )[exchangeIdx];

                    return (
                      <div key={exchangeIdx} className="space-y-4">
                        {/* User message (shown once) */}
                        {userMsgA && (
                          <Message from="user">
                            <MessageContent>
                              <Response>{userMsgA.content}</Response>
                            </MessageContent>
                          </Message>
                        )}

                        {/* Side-by-side responses */}
                        <div className="space-y-4">
                          {/* Response A */}
                          <div className="border-2 rounded-lg p-4 bg-card">
                            <div className="text-sm font-semibold mb-3 flex items-center justify-between">
                              <span>Response A</span>
                              {isStreaming && exchangeIdx === exchangeCount - 1 && (
                                <span className="text-xs text-muted-foreground">
                                  Streaming...
                                </span>
                              )}
                            </div>
                            <div className="text-sm whitespace-pre-wrap">
                              {assistantMsgA?.content || (
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
                              {isStreaming && exchangeIdx === exchangeCount - 1 && (
                                <span className="text-xs text-muted-foreground">
                                  Streaming...
                                </span>
                              )}
                            </div>
                            <div className="text-sm whitespace-pre-wrap">
                              {assistantMsgB?.content || (
                                <span className="text-muted-foreground">
                                  Waiting for response...
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ConversationContent>
          </Conversation>
        </div>
      </div>

      {/* Fixed Voting Bar - above input */}
      {votingEnabled && (
        <div className="py-4 px-6 flex items-center justify-center">
          <div className="inline-flex items-center justify-center bg-card border rounded-xl shadow-sm px-2 py-2">
            <VotingButtons onVote={handleVote} disabled={savingSample} />
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="border-t bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        <div className="px-6 py-4">
          <PromptInput onSubmit={handleSubmit}>
            <PromptInputBody>
              <PromptInputTextarea
                placeholder="Type your message..."
                className="min-h-[44px] max-h-[200px]"
                disabled={isStreaming || isGeneratingVariants}
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
                  status={isStreaming || isGeneratingVariants ? "streaming" : "ready"}
                  disabled={isStreaming || isGeneratingVariants}
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
        hideRatingButtons={true}
      />
    </div>
  );
}
