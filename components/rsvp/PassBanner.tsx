"use client";

import { useEffect } from "react";
import { Card } from "@/components/ui/Card";
import { CheckIcon } from "@/components/ui/icons";

export function PassBanner({
  score,
  hint,
  newWpm,
  onContinue,
}: {
  score: number;
  hint: string;
  newWpm: number;
  onContinue: () => void;
}) {
  useEffect(() => {
    const timeout = setTimeout(onContinue, 1800);
    return () => clearTimeout(timeout);
  }, [onContinue]);

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
      <p className="text-xs text-muted">Speeding up to {newWpm} WPM for the next module...</p>
    </div>
  );
}
