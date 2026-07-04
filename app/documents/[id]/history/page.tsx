"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";

type Attempt = {
  id: string;
  summary: string;
  score: number;
  hint: string;
  socraticQuestion: string | null;
  wpmAtAttempt: number;
  passed: boolean;
  createdAt: string;
  chunk: { title: string; order: number };
};

export default function DocumentHistoryPage() {
  const params = useParams<{ id: string }>();
  const [documentTitle, setDocumentTitle] = useState<string | null>(null);
  const [attempts, setAttempts] = useState<Attempt[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetch(`/api/documents/${params.id}`).then((res) => res.json()),
      fetch(`/api/documents/${params.id}/history`).then((res) => res.json()),
    ]).then(([documentJson, historyJson]) => {
      if (cancelled) return;
      setDocumentTitle(documentJson.document.title);
      setAttempts(historyJson.attempts);
    });

    return () => {
      cancelled = true;
    };
  }, [params.id]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/documents/${params.id}`} className="text-xs text-muted transition-colors hover:text-foreground">
          ← Back to Learning Path
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {documentTitle ?? <Skeleton className="inline-block h-7 w-56 align-middle" />}
        </h1>
        <p className="mt-1 text-sm text-muted">Every summary you&apos;ve submitted for this document.</p>
      </div>

      {attempts === null ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      ) : attempts.length === 0 ? (
        <Card className="py-10 text-center text-sm text-muted">No attempts yet for this document.</Card>
      ) : (
        <div className="flex flex-col gap-3">
          {attempts.map((attempt) => (
            <Card key={attempt.id} className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium leading-tight">{attempt.chunk.title}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {new Date(attempt.createdAt).toLocaleString()} · {attempt.wpmAtAttempt} WPM
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1 text-xs font-medium",
                    attempt.passed ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
                  )}
                >
                  {attempt.score}/100
                </span>
              </div>

              <div className="rounded-lg border border-border bg-background p-3 text-sm text-foreground/90">
                {attempt.summary}
              </div>

              {attempt.hint && <p className="text-sm text-muted">{attempt.hint}</p>}

              {attempt.socraticQuestion && (
                <p className="text-sm text-accent">Guiding question: {attempt.socraticQuestion}</p>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
