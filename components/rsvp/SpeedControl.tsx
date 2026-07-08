"use client";

import { MIN_WPM, MAX_WPM } from "@/lib/wpm";
import { cn } from "@/lib/cn";

const STEP = 25;

function clampWpm(value: number) {
  return Math.min(MAX_WPM, Math.max(MIN_WPM, value));
}

export function SpeedControl({
  wpm,
  onChange,
  className,
}: {
  wpm: number;
  onChange: (wpm: number) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex w-full items-center gap-3", className)}>
      <button
        type="button"
        aria-label="Slow down"
        disabled={wpm <= MIN_WPM}
        onClick={() => onChange(clampWpm(wpm - STEP))}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-lg leading-none text-foreground transition-colors hover:bg-surface-hover active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
      >
        −
      </button>

      <div className="flex flex-1 flex-col items-center gap-1">
        <input
          type="range"
          min={MIN_WPM}
          max={MAX_WPM}
          step={10}
          value={wpm}
          onChange={(event) => onChange(Number(event.target.value))}
          aria-label="Reading speed in words per minute"
          className="h-2 w-full cursor-pointer appearance-none rounded-full bg-border accent-accent"
        />
        <span className="text-xs tabular-nums text-muted">{wpm} WPM</span>
      </div>

      <button
        type="button"
        aria-label="Speed up"
        disabled={wpm >= MAX_WPM}
        onClick={() => onChange(clampWpm(wpm + STEP))}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-lg leading-none text-foreground transition-colors hover:bg-surface-hover active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
      >
        +
      </button>
    </div>
  );
}
