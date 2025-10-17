"use client";

import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import {
    ChevronRight,
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

export default function SamplesPage() {
  const [currentGroup, setCurrentGroup] = useState<SampleGroup | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCurrentGroup();
  }, []);

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
      console.error("Failed to load current group:", error);
      toast.error("Failed to load current group");
    } finally {
      setLoading(false);
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
    <div className="font-sans w-full min-h-screen bg-background">
      {/* Header */}
      <div className="border-b">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-medium">
                Samples {currentGroup && `- ${currentGroup.name}`}
              </h1>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {loading ? (
          <div className="border rounded-lg p-12 bg-card text-center">
            <Loader2 className="size-12 animate-spin mx-auto mb-4 opacity-50" />
            <p className="text-muted-foreground">Loading samples...</p>
          </div>
        ) : !currentGroup ? (
          <div className="border rounded-lg p-12 bg-card text-center">
            <Database className="size-16 mx-auto mb-4 opacity-20" />
            <p className="text-muted-foreground">No group selected</p>
            <p className="text-xs text-muted-foreground mt-1">
              Select a group from the sidebar
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Group Info */}
            <div className="border rounded-lg p-6 bg-card">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="size-4" />
                {formatDate(currentGroup.timestamp)}
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                {currentGroup.samples.length} sample
                {currentGroup.samples.length !== 1 ? "s" : ""} in this group
              </p>
            </div>

            {/* Samples List */}
            {currentGroup.samples.length === 0 ? (
              <div className="border rounded-lg p-12 bg-card text-center">
                <MessageSquare className="size-16 mx-auto mb-4 opacity-20" />
                <p className="text-muted-foreground">No samples yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Samples will appear here as you add them from the Chat page
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {currentGroup.samples.map((sample: any) => (
                      <div
                        key={sample.id}
                        className="border rounded-lg p-6 bg-card"
                      >
                        <div className="flex items-center justify-between mb-4">
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

                        <div className="space-y-3">
                          {sample.messages.map((msg: any, idx: number) => (
                            <div key={idx} className="space-y-2">
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
                          <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
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
            )}
          </div>
        </div>
  );
}
