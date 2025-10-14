"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { useEffect, useState } from "react";

interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (feedback: {
    rating: "positive" | "negative";
    comment?: string;
  }) => void;
  isSaving?: boolean;
  autoMessage?: string;
  hideRatingButtons?: boolean;
}

export function FeedbackDialog({
  open,
  onOpenChange,
  onSave,
  isSaving = false,
  autoMessage,
  hideRatingButtons = false,
}: FeedbackDialogProps) {
  const [rating, setRating] = useState<"positive" | "negative" | null>(null);
  const [comment, setComment] = useState("");

  // Auto-set rating when buttons are hidden (Improve Mode)
  useEffect(() => {
    if (hideRatingButtons && open) {
      setRating("positive"); // Arbitrary, since ImproveChat provides actual ratings
    }
  }, [hideRatingButtons, open]);

  const handleSave = () => {
    if (!rating) return;
    onSave({
      rating,
      comment: comment.trim() || undefined,
    });
    // Reset state
    setRating(null);
    setComment("");
  };

  const handleCancel = () => {
    setRating(null);
    setComment("");
    onOpenChange(false);
  };

  // Keyboard shortcut for saving (Cmd/Ctrl + S)
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const modifierKey = isMac ? e.metaKey : e.ctrlKey;

      // Cmd/Ctrl + S to save
      if (e.key === "s" && modifierKey && rating) {
        e.preventDefault();
        handleSave();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, rating, comment]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Save Sample with Feedback</DialogTitle>
          <DialogDescription>
            Rate this conversation and optionally add feedback to improve future
            responses.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Auto message from Improve Mode voting */}
          {autoMessage && (
            <div className="px-4 py-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/40 rounded-md">
              <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                {autoMessage}
              </p>
            </div>
          )}
          {/* Rating buttons - hidden in Improve Mode */}
          {!hideRatingButtons && (
            <div className="flex items-center justify-center gap-4">
              <Button
                type="button"
                variant={rating === "positive" ? "default" : "outline"}
                size="lg"
                onClick={() => setRating("positive")}
                data-feedback="positive"
                className={cn(
                  "flex flex-col items-center gap-2 h-auto py-4 px-8",
                  rating === "positive" &&
                    "bg-green-600 hover:bg-green-700 text-white"
                )}
              >
                <ThumbsUp className="size-8" />
                <span className="text-sm font-medium">Good</span>
              </Button>

              <Button
                type="button"
                variant={rating === "negative" ? "default" : "outline"}
                size="lg"
                onClick={() => setRating("negative")}
                data-feedback="negative"
                className={cn(
                  "flex flex-col items-center gap-2 h-auto py-4 px-8",
                  rating === "negative" &&
                    "bg-red-600 hover:bg-red-700 text-white"
                )}
              >
                <ThumbsDown className="size-8" />
                <span className="text-sm font-medium">Bad</span>
              </Button>
            </div>
          )}

          {/* Optional comment field */}
          <div className="space-y-2">
            <label
              htmlFor="feedback-comment"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Additional Feedback (Optional)
            </label>
            <Textarea
              id="feedback-comment"
              placeholder="What made this response good or bad? Any specific improvements you'd like to see?"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="min-h-[100px]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={!rating || isSaving}
          >
            {isSaving ? "Saving..." : "Save Sample"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
