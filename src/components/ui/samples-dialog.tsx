"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Clock,
  Database,
  Loader2,
  MessageSquare,
  ThumbsDown,
  ThumbsUp,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface SampleGroup {
  id: string;
  name: string;
  timestamp: string;
  samples: any[];
}

interface SamplesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SamplesDialog({ open, onOpenChange }: SamplesDialogProps) {
  const [currentGroup, setCurrentGroup] = useState<SampleGroup | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open) {
      loadCurrentGroup();
    }
  }, [open]);

  const loadCurrentGroup = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/sample-groups");
      if (response.ok) {
        const data = await response.json();
        const current = data.groups.find(
          (g: SampleGroup) => g.id === data.currentGroupId
        );
        setCurrentGroup(current || null);
      }
    } catch (error) {
      console.error("Failed to load current prompt:", error);
      toast.error("Failed to load current prompt");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSample = async (sampleId: string) => {
    if (!confirm("Are you sure you want to delete this sample?")) return;

    try {
      const response = await fetch(`/api/samples?id=${sampleId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        toast.success("Sample deleted");
        // Reload the current group to reflect the deletion
        await loadCurrentGroup();
      } else {
        toast.error("Failed to delete sample");
      }
    } catch (error) {
      console.error("Failed to delete sample:", error);
      toast.error("Failed to delete sample");
    }
  };

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatMessage = (message: any) => {
    if (typeof message.content === "string") {
      return message.content;
    }

    if (Array.isArray(message.content)) {
      return message.content
        .map((part: any) => {
          if (part.type === "text") return part.text;
          if (part.type === "tool-call") return `[Tool: ${part.toolName}]`;
          if (part.type === "tool-result") return `[Result: ${part.toolName}]`;
          return "";
        })
        .filter(Boolean)
        .join(" ");
    }

    return "";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            Samples {currentGroup && `- ${currentGroup.name}`}
          </DialogTitle>
          <DialogDescription>
            View all samples from the current prompt
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-2">
          {loading ? (
            <div className="flex flex-col items-center justify-center p-12">
              <Loader2 className="size-12 animate-spin mx-auto mb-4 opacity-50" />
              <p className="text-muted-foreground">Loading samples...</p>
            </div>
          ) : !currentGroup ? (
            <div className="flex flex-col items-center justify-center p-12">
              <Database className="size-16 mx-auto mb-4 opacity-20" />
              <p className="text-muted-foreground">No prompt selected</p>
              <p className="text-xs text-muted-foreground mt-1">
                Select a prompt from the sidebar
              </p>
            </div>
          ) : currentGroup.samples.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12">
              <MessageSquare className="size-16 mx-auto mb-4 opacity-20" />
              <p className="text-muted-foreground">No samples yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Samples will appear here as you add them from the Chat page
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Group Info */}
              <div className="border rounded-lg p-4 bg-card">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="size-4" />
                  {formatDate(currentGroup.timestamp)}
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  {currentGroup.samples.length} sample
                  {currentGroup.samples.length !== 1 ? "s" : ""} in this prompt
                </p>
              </div>

              {/* Samples List */}
              {currentGroup.samples.map((sample: any) => (
                <div
                  key={sample.id}
                  className="border rounded-lg p-4 bg-card space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="text-xs text-muted-foreground">
                        {formatDate(sample.timestamp)}
                      </div>
                      {sample.feedback && (
                        <div className="flex items-center gap-2">
                          {sample.feedback.rating === "positive" ? (
                            <ThumbsUp className="size-4 text-green-600" />
                          ) : (
                            <ThumbsDown className="size-4 text-red-600" />
                          )}
                          <span className="text-xs text-muted-foreground">
                            {sample.feedback.rating}
                          </span>
                        </div>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 hover:text-destructive"
                      onClick={() => handleDeleteSample(sample.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>

                  <div className="space-y-2">
                    {sample.messages.map((msg: any, idx: number) => (
                      <div key={idx}>
                        <div
                          className={`p-3 rounded-lg ${
                            msg.role === "user"
                              ? "bg-blue-50 dark:bg-blue-900/20"
                              : msg.role === "assistant"
                              ? "bg-muted/50"
                              : "bg-amber-50 dark:bg-amber-900/20"
                          }`}
                        >
                          <div className="text-xs font-semibold text-muted-foreground mb-1">
                            {msg.role.charAt(0).toUpperCase() +
                              msg.role.slice(1)}
                          </div>
                          <div className="text-sm whitespace-pre-wrap">
                            {formatMessage(msg)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {sample.feedback && sample.feedback.comment && (
                    <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                      <div className="text-xs font-semibold text-amber-800 dark:text-amber-200 mb-1">
                        Feedback
                      </div>
                      <div className="text-sm text-amber-900 dark:text-amber-100">
                        {sample.feedback.comment}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
