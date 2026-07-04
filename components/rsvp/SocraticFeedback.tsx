"use client";

import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { RefreshIcon } from "@/components/ui/icons";

export function SocraticFeedback({
  score,
  hint,
  socraticQuestion,
  newWpm,
  onReadAgain,
}: {
  score: number;
  hint: string;
  socraticQuestion: string | null;
  newWpm: number;
  onReadAgain: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 py-4">
      <Card className="border-danger/30 bg-danger-soft">
        <p className="text-sm font-medium text-danger">Score: {score}/100 — not quite there yet</p>
        {hint && <p className="mt-2 text-sm text-foreground/90">{hint}</p>}
      </Card>

      {socraticQuestion && (
        <Card className="border-accent/30 bg-accent-soft">
          <p className="text-xs font-medium uppercase tracking-wide text-accent">Think about this</p>
          <p className="mt-2 text-sm text-foreground/90">{socraticQuestion}</p>
        </Card>
      )}

      <p className="text-xs text-muted">
        Reading speed adjusted to {newWpm} WPM so you can catch what you missed.
      </p>

      <Button icon={<RefreshIcon />} onClick={onReadAgain}>
        Read Again
      </Button>
    </div>
  );
}
