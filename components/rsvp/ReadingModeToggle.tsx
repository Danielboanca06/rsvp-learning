"use client";

import { cn } from "@/lib/cn";

export type ReadingMode = "rsvp" | "paragraph";

export function ReadingModeToggle({
  mode,
  onChange,
}: {
  mode: ReadingMode;
  onChange: (mode: ReadingMode) => void;
}) {
  return (
    <div className="flex rounded-full border border-border bg-surface p-1 text-xs">
      {(
        [
          { value: "rsvp", label: "Flash" },
          { value: "paragraph", label: "Paragraph" },
        ] as const
      ).map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={mode === option.value}
          className={cn(
            "rounded-full px-3 py-1.5 font-medium transition-colors",
            mode === option.value ? "bg-accent text-accent-foreground" : "text-muted hover:text-foreground"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
