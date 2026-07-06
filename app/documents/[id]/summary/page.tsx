"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";

type Segment = {
  chunkId: string;
  order: number;
  title: string;
  content: string;
  summary: string | null;
  passed: boolean;
};

type SummaryViewResponse = {
  document: { id: string; title: string };
  segments: Segment[];
};

export default function DocumentSummaryPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<SummaryViewResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/documents/${params.id}/summary-view`)
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled) setData(json);
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
        <h1 className="mt-2 font-display text-3xl italic tracking-tight">
          {data ? data.document.title : <Skeleton className="inline-block h-7 w-56 align-middle" />}
        </h1>
        <p className="mt-1 text-sm text-muted">The full text, with your saved summary docked beside each module.</p>
      </div>

      {data === null ? (
        <div className="flex flex-col gap-6">
          {[0, 1, 2].map((index) => (
            <div key={index} className="flex flex-col gap-4 md:flex-row md:items-start">
              <Skeleton className="h-24 flex-1 rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl md:w-72" />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {data.segments.map((segment) => (
            <div key={segment.chunkId} className="flex flex-col gap-4 border-b border-border pb-6 last:border-b-0 md:flex-row md:items-start">
              <div className="flex-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted">
                  {segment.order + 1}. {segment.title}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{segment.content}</p>
              </div>
              <Card className={cn("md:w-72 md:shrink-0", segment.summary ? "bg-accent-soft" : "bg-background")}>
                <p className="text-xs font-medium uppercase tracking-wide text-muted">
                  {segment.summary ? (segment.passed ? "Your summary" : "Draft summary (not yet passed)") : "Not summarized yet"}
                </p>
                <p className="mt-2 text-sm text-foreground/90">{segment.summary ?? "You haven't reached or passed this module yet."}</p>
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
