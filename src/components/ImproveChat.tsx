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
import { Button } from "@/components/ui/button";
import { FeedbackDialog } from "@/components/ui/feedback-dialog";
import { type VoteChoice, VotingButtons } from "@/components/ui/voting-buttons";
import { MessageSquare, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

interface ImproveChatProps {
  selectedModel: string;
  onModelChange: (model: string) => void;
  textModels: Array<{ id: string; name: string }>;
  preferencesLoaded: boolean;
  reflectionModel?: string;
  onPromptUpdate?: () => void;
  onChatReset?: () => void;
  onRefinementStatusChange?: (isRefining: boolean) => void;
}

type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

type Thread = {
  systemPrompt: string;
  messages: ConversationMessage[];
};

type VariantAnalysis = {
  exploitationStrategy: string;
  explorationStrategy: string;
  keyStrengths: string[];
  keyIssues: string[];
};

export function ImproveChat({
  selectedModel,
  onModelChange,
  textModels,
  preferencesLoaded,
  reflectionModel = "anthropic/claude-haiku-4.5",
  onPromptUpdate,
  onChatReset,
  onRefinementStatusChange,
}: ImproveChatProps) {
  const [threadA, setThreadA] = useState<Thread | null>(null);
  const [threadB, setThreadB] = useState<Thread | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isGeneratingVariants, setIsGeneratingVariants] = useState(false);
  const [votingEnabled, setVotingEnabled] = useState(false);
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false);
  const [pendingVote, setPendingVote] = useState<VoteChoice | null>(null);
  const [savingSample, setSavingSample] = useState(false);
  const [seedPrompt, setSeedPrompt] = useState<string>("");
  const [variantAnalysis, setVariantAnalysis] = useState<VariantAnalysis | null>(null);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [lastUserMessage, setLastUserMessage] = useState("");
  const [isRefining, setIsRefining] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<ConversationMessage[]>([]);
  const [shouldResubmit, setShouldResubmit] = useState(false);
  const [pendingUserMessage, setPendingUserMessage] = useState<string | null>(null);

  // Track last user message for resubmission
  useEffect(() => {
    if (threadA?.messages) {
      const userMessages = threadA.messages.filter((m) => m.role === "user");
      if (userMessages.length > 0) {
        const lastMsg = userMessages[userMessages.length - 1];
        setLastUserMessage(lastMsg.content);
      }
    }
  }, [threadA]);

  // Handle auto-resubmit when shouldResubmit is set
  useEffect(() => {
    if (shouldResubmit && lastUserMessage) {
      setShouldResubmit(false);
      console.log("[ImproveChat] Auto-resubmitting:", lastUserMessage);
      // Call handleSubmit without including it in dependencies to avoid circular dependency
      // The latest version will be called due to closure
      handleSubmit({ text: lastUserMessage });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldResubmit, lastUserMessage]);

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
          // Show user message immediately for better UX
          setPendingUserMessage(text);
          setIsGeneratingVariants(true);

          const variantsResponse = await fetch("/api/generate-prompt-variants", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reflectionModel }),
          });

          if (!variantsResponse.ok) {
            throw new Error("Failed to generate variants");
          }

          const { variantA, variantB, seedPrompt: seed, analysis } = await variantsResponse.json();

          // Store seed prompt and analysis for history tracking
          setSeedPrompt(seed);
          setVariantAnalysis(analysis);

          // Initialize threads with system prompts
          // If we have conversation history (from loop mode), prepend it
          const newUserMessage: ConversationMessage = { role: "user", content: text };
          const initialMessages: ConversationMessage[] = conversationHistory.length > 0
            ? [...conversationHistory, newUserMessage]
            : [newUserMessage];

          setThreadA({
            systemPrompt: variantA,
            messages: initialMessages,
          });
          setThreadB({
            systemPrompt: variantB,
            messages: initialMessages,
          });

          // Clear conversation history after restoring
          if (conversationHistory.length > 0) {
            setConversationHistory([]);
          }

          // Clear pending message now that threads are initialized
          setPendingUserMessage(null);
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
        setPendingUserMessage(null); // Clear pending message on error
      } finally {
        setIsStreaming(false);
      }
    },
    [selectedModel, reflectionModel, threadA, threadB, conversationHistory]
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
            systemPrompt: threadA.systemPrompt, // Track which prompt generated this sample
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
            systemPrompt: threadB.systemPrompt, // Track which prompt generated this sample
          }),
        });

        // Save improve history entry
        try {
          await fetch("/api/improve-history", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              seedPrompt,
              variantAPrompt: threadA.systemPrompt,
              variantBPrompt: threadB.systemPrompt,
              variantAStrategy: variantAnalysis?.exploitationStrategy || "Variant A",
              variantBStrategy: variantAnalysis?.explorationStrategy || "Variant B",
              winner: pendingVote,
            }),
          });

          console.log("[ImproveChat] Improve history saved with winner:", pendingVote);
        } catch (error) {
          console.error("[ImproveChat] Error saving improve history:", error);
          // Don't fail the whole operation if history save fails
        }

        // Determine winning prompt
        let winningPrompt: string | null = null;
        if (pendingVote === "a-better") {
          winningPrompt = threadA.systemPrompt;
        } else if (pendingVote === "b-better") {
          winningPrompt = threadB.systemPrompt;
        } else if (pendingVote === "tie") {
          // For tie, use variant A as base for refinement
          winningPrompt = threadA.systemPrompt;
        } else if (pendingVote === "both-bad") {
          // For both-bad, use the seed prompt as base for refinement
          winningPrompt = seedPrompt;
        }

        let finalPrompt = winningPrompt;

        // Refine prompt if there's a comment (for all vote types)
        if (winningPrompt && feedback.comment?.trim()) {
          try {
            setIsRefining(true);
            onRefinementStatusChange?.(true);

            toast.info("Refining prompt based on your feedback...");

            const refineResponse = await fetch("/api/fast-refine-prompt", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                winningPrompt,
                userComment: feedback.comment,
                reflectionModel,
              }),
            });

            if (refineResponse.ok) {
              const { refinedPrompt } = await refineResponse.json();
              finalPrompt = refinedPrompt;
              console.log("[ImproveChat] Prompt refined based on comment");
            }
          } catch (error) {
            console.error("[ImproveChat] Error refining prompt:", error);
            // Fall back to winning prompt if refinement fails
            finalPrompt = winningPrompt;
          } finally {
            setIsRefining(false);
            onRefinementStatusChange?.(false);
          }
        }

        // Update prompt with final version (refined or winner)
        if (finalPrompt) {
          try {
            console.log("[ImproveChat] Saving final prompt");

            const response = await fetch("/api/prompt", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ prompt: finalPrompt }),
            });

            if (!response.ok) {
              throw new Error(`Failed to update prompt: ${response.status}`);
            }

            const wasRefined = finalPrompt !== winningPrompt;
            const winnerLabel =
              pendingVote === "a-better" ? "A" : pendingVote === "b-better" ? "B" : "saved";

            toast.success(
              wasRefined
                ? `Prompt refined and saved (Variant ${winnerLabel})`
                : `Prompt updated with Variant ${winnerLabel}`
            );

            // Notify parent to refresh prompt editor
            onPromptUpdate?.();
          } catch (error) {
            console.error("[ImproveChat] Error updating prompt:", error);
            toast.error("Samples saved but failed to update prompt");
          }
        } else {
          toast.success("Samples saved successfully");
        }

        setPendingVote(null);
        setFeedbackDialogOpen(false);

        // If loop enabled, prepare for auto-resubmit
        if (loopEnabled && lastUserMessage && finalPrompt) {
          // Save conversation history before clearing (excluding last user/assistant pair)
          if (threadA?.messages && threadA.messages.length > 2) {
            const historyMessages = threadA.messages.slice(0, -2);
            setConversationHistory(historyMessages);
          } else {
            setConversationHistory([]);
          }

          // Clear threads to trigger new variant generation
          setThreadA(null);
          setThreadB(null);
          setVotingEnabled(false);

          // Trigger auto-resubmit via effect (avoids circular dependency)
          console.log("[ImproveChat] Triggering auto-resubmit for:", lastUserMessage);
          setShouldResubmit(true);
        } else {
          // Loop disabled: clear threads and reset
          setThreadA(null);
          setThreadB(null);
          setVotingEnabled(false);
          setConversationHistory([]);
          onChatReset?.();
        }
      } catch (error) {
        console.error("[ImproveChat] Error saving samples:", error);
        toast.error("Failed to save samples");
      } finally {
        setSavingSample(false);
      }
    },
    [
      threadA,
      threadB,
      pendingVote,
      seedPrompt,
      variantAnalysis,
      reflectionModel,
      loopEnabled,
      lastUserMessage,
      onPromptUpdate,
      onChatReset,
      onRefinementStatusChange,
    ]
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
              {pendingUserMessage ? (
                // Show pending user message during variant generation
                <div className="space-y-8">
                  <Message from="user">
                    <MessageContent>
                      <Response>{pendingUserMessage}</Response>
                    </MessageContent>
                  </Message>
                  <div className="flex items-center justify-center py-8">
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <div className="h-2 w-2 rounded-full bg-primary animate-pulse"></div>
                      <div className="h-2 w-2 rounded-full bg-primary animate-pulse [animation-delay:0.2s]"></div>
                      <div className="h-2 w-2 rounded-full bg-primary animate-pulse [animation-delay:0.4s]"></div>
                      <span className="ml-2 text-sm">Exploring prompt variants...</span>
                    </div>
                  </div>
                </div>
              ) : !threadA || !threadB ? (
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
                <Button
                  type="button"
                  variant={loopEnabled ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setLoopEnabled(!loopEnabled)}
                  disabled={isStreaming || isGeneratingVariants}
                  title={loopEnabled ? "Auto-resubmit enabled" : "Enable auto-resubmit after voting"}
                  className="h-8 w-8 p-0"
                >
                  <RefreshCw className={`h-4 w-4 ${loopEnabled ? "text-primary-foreground" : ""}`} />
                </Button>
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
