"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ArrowRightIcon } from "@/components/ui/icons";

export function ReviewComplete({
  reviewedCount,
  averageScore,
}: {
  reviewedCount: number;
  averageScore: number | null;
}) {
  return (
    <div className="flex flex-col items-center gap-6 py-16 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-success-soft text-success text-2xl">
        ✓
      </span>
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Review complete</h2>
        <p className="mt-1 text-sm text-muted">
          {reviewedCount} {reviewedCount === 1 ? "card" : "cards"} reviewed. Come back when the next batch is due.
        </p>
      </div>

      <div className="grid w-full max-w-sm grid-cols-2 gap-4">
        <Card>
          <p className="text-xs uppercase tracking-wide text-muted">Reviewed</p>
          <p className="mt-2 text-2xl font-semibold">{reviewedCount}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-muted">Average score</p>
          <p className="mt-2 text-2xl font-semibold">{averageScore ?? "—"}</p>
        </Card>
      </div>

      <Link href="/" className="w-full max-w-sm">
        <Button icon={<ArrowRightIcon />}>Back to Dashboard</Button>
      </Link>
    </div>
  );
}
