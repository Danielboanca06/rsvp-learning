"use client";

import { useEffect } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { CheckIcon } from "@/components/ui/icons";

export function PassBanner({
  score,
  hint,
  keyPoints,
  newWpm,
  onContinue,
}: {
  score: number;
  hint: string;
  keyPoints?: string[];
  newWpm: number;
  onContinue: () => void;
}) {
  const hasKeyPoints = Boolean(keyPoints && keyPoints.length > 0);

  useEffect(() => {
    // With key points on screen the reader needs time to re-read them, so the
    // auto-advance stretches and a manual Continue button appears instead.
    const timeout = setTimeout(onContinue, hasKeyPoints ? 9000 : 1800);
    return () => clearTimeout(timeout);
  }, [onContinue, hasKeyPoints]);

  return (
    <div className="flex flex-col gap-4 py-4">
      <Card className="border-success/30 bg-success-soft">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-success text-background">
            <CheckIcon />
          </span>
          <p className="text-sm font-medium text-success">Score: {score}/100 — nice work</p>
        </div>
        {hint && <p className="mt-2 text-sm text-foreground/90">{hint}</p>}
      </Card>

      {hasKeyPoints && (
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Key points to keep</p>
          <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-sm text-foreground/90">
            {keyPoints!.map((point, index) => (
              <li key={index}>{point}</li>
            ))}
          </ul>
        </Card>
      )}

      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-muted">Speeding up to {newWpm} WPM for the next module...</p>
        {hasKeyPoints && (
          <Button variant="secondary" onClick={onContinue} className="w-auto px-6">
            Continue
          </Button>
        )}
      </div>
    </div>
  );
}
