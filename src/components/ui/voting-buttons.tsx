"use client";

import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, HandshakeIcon, ThumbsDown } from "lucide-react";

export type VoteChoice = "a-better" | "b-better" | "tie" | "both-bad";

interface VotingButtonsProps {
  onVote: (choice: VoteChoice) => void;
  disabled?: boolean;
}

export function VotingButtons({ onVote, disabled = false }: VotingButtonsProps) {
  return (
    <div className="flex items-center justify-center gap-3 py-4">
      <Button
        variant="outline"
        size="lg"
        onClick={() => onVote("a-better")}
        disabled={disabled}
        className="flex items-center gap-2 h-auto py-3 px-6"
      >
        <ArrowLeft className="size-5" />
        <span>A is better</span>
      </Button>

      <Button
        variant="outline"
        size="lg"
        onClick={() => onVote("b-better")}
        disabled={disabled}
        className="flex items-center gap-2 h-auto py-3 px-6"
      >
        <span>B is better</span>
        <ArrowRight className="size-5" />
      </Button>

      <Button
        variant="outline"
        size="lg"
        onClick={() => onVote("tie")}
        disabled={disabled}
        className="flex items-center gap-2 h-auto py-3 px-6"
      >
        <HandshakeIcon className="size-5" />
        <span>Tie</span>
      </Button>

      <Button
        variant="outline"
        size="lg"
        onClick={() => onVote("both-bad")}
        disabled={disabled}
        className="flex items-center gap-2 h-auto py-3 px-6"
      >
        <ThumbsDown className="size-5" />
        <span>Both are bad</span>
      </Button>
    </div>
  );
}
