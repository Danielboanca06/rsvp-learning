"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ArrowRightIcon, HistoryIcon, CheckIcon } from "@/components/ui/icons";

export function SessionComplete({
  documentId,
  finalWpm,
  averageScore,
}: {
  documentId: string;
  finalWpm: number;
  averageScore: number | null;
}) {
  return (
    <div className="flex flex-col items-center gap-6 py-16 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-success-soft text-success [&>svg]:h-7 [&>svg]:w-7">
        <CheckIcon />
      </span>
      <div>
        <h2 className="font-display text-3xl italic tracking-tight">Document mastered</h2>
        <p className="mt-1 text-sm text-muted">Every module in this document has been passed.</p>
      </div>

      <div className="grid w-full max-w-sm grid-cols-2 gap-4">
        <Card>
          <p className="text-xs uppercase tracking-wide text-muted">Ending speed</p>
          <p className="mt-2 text-2xl font-semibold">{finalWpm} WPM</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-muted">Average score</p>
          <p className="mt-2 text-2xl font-semibold">{averageScore ?? "—"}</p>
        </Card>
      </div>

      <div className="flex w-full max-w-sm flex-col gap-3 sm:flex-row">
        <Link href="/" className="w-full">
          <Button icon={<ArrowRightIcon />}>Back to Dashboard</Button>
        </Link>
        <Link href={`/documents/${documentId}/history`} className="w-full">
          <Button variant="secondary" icon={<HistoryIcon />}>
            View History
          </Button>
        </Link>
      </div>
    </div>
  );
}
