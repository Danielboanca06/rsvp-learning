"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { CheckIcon } from "@/components/ui/icons";

export function SummaryForm({
  moduleTitle,
  initialValue,
  grading,
  onSubmit,
}: {
  moduleTitle: string;
  initialValue: string;
  grading: boolean;
  onSubmit: (summary: string) => void;
}) {
  const [summary, setSummary] = useState(initialValue);

  return (
    <div className="flex flex-col gap-4 py-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Summarize what you just read</h2>
        <p className="mt-1 text-sm text-muted">{moduleTitle}</p>
      </div>
      <Textarea
        value={summary}
        onChange={(event) => setSummary(event.target.value)}
        placeholder="Write your summary of the module here..."
        className="h-48"
        disabled={grading}
        autoFocus
      />
      <Button
        icon={<CheckIcon />}
        loading={grading}
        disabled={summary.trim().length === 0}
        onClick={() => onSubmit(summary.trim())}
      >
        {grading ? "Evaluating..." : "Submit Summary"}
      </Button>
    </div>
  );
}
