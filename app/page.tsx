"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { SparklineChart } from "@/components/charts/SparklineChart";
import { ReviewCallout } from "@/components/dashboard/ReviewCallout";
import { PlusIcon, ArrowRightIcon, FileTextIcon, ClockIcon } from "@/components/ui/icons";

type DocumentStat = {
  id: string;
  title: string;
  createdAt: string;
  totalChunks: number;
  masteredChunks: number;
  masteryPct: number;
  attemptCount: number;
  averageScore: number | null;
};

type AnalyticsResponse = {
  documents: DocumentStat[];
  scoreHistory: { createdAt: string; score: number }[];
  wpmHistory: { createdAt: string; wpm: number }[];
  totals: { documentCount: number; attemptCount: number; averageScore: number | null };
  review: { dueCount: number; nextDueAt: string | null };
};

export default function DashboardPage() {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/analytics")
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted">Track mastery across every document you&apos;ve studied.</p>
        </div>
        <Link href="/documents/new" className="w-auto">
          <Button icon={<PlusIcon />} className="w-auto px-6">
            New Document
          </Button>
        </Link>
      </div>

      {!loading && data!.review.dueCount > 0 && <ReviewCallout dueCount={data!.review.dueCount} />}
      {!loading && data!.review.dueCount === 0 && data!.review.nextDueAt && (
        <p className="-mt-4 flex items-center gap-1.5 text-xs text-muted">
          <ClockIcon />
          Next review due {new Date(data!.review.nextDueAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
        </p>
      )}

      {loading ? <StatsSkeleton /> : <StatsRow totals={data!.totals} />}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {loading ? (
          <>
            <ChartSkeleton />
            <ChartSkeleton />
          </>
        ) : (
          <>
            <Card>
              <p className="text-sm font-medium text-muted">Score history</p>
              <SparklineChart data={data!.scoreHistory.map((point) => point.score)} color="#8b5cf6" />
            </Card>
            <Card>
              <p className="text-sm font-medium text-muted">Reading speed progression (WPM)</p>
              <SparklineChart data={data!.wpmHistory.map((point) => point.wpm)} color="#34d399" />
            </Card>
          </>
        )}
      </div>

      <div>
        <h2 className="mb-4 text-lg font-semibold tracking-tight">Your documents</h2>
        {loading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <DocumentCardSkeleton />
            <DocumentCardSkeleton />
          </div>
        ) : data!.documents.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {data!.documents.map((document) => (
              <DocumentCard key={document.id} document={document} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatsRow({ totals }: { totals: AnalyticsResponse["totals"] }) {
  const items = [
    { label: "Documents", value: totals.documentCount },
    { label: "Attempts graded", value: totals.attemptCount },
    { label: "Average score", value: totals.averageScore === null ? "—" : `${totals.averageScore}/100` },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {items.map((item) => (
        <Card key={item.label}>
          <p className="text-xs uppercase tracking-wide text-muted">{item.label}</p>
          <p className="mt-2 text-3xl font-semibold">{item.value}</p>
        </Card>
      ))}
    </div>
  );
}

function StatsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {[0, 1, 2].map((index) => (
        <Card key={index}>
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-8 w-16" />
        </Card>
      ))}
    </div>
  );
}

function ChartSkeleton() {
  return (
    <Card>
      <Skeleton className="h-3 w-32" />
      <Skeleton className="mt-4 h-20 w-full" />
    </Card>
  );
}

function DocumentCard({ document }: { document: DocumentStat }) {
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <FileTextIcon />
          </span>
          <div>
            <p className="font-medium leading-tight">{document.title}</p>
            <p className="mt-1 text-xs text-muted">
              {document.totalChunks} modules · {document.attemptCount} attempts
              {document.averageScore !== null ? ` · avg score ${document.averageScore}` : ""}
            </p>
          </div>
        </div>
      </div>
      <div>
        <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
          <span>Mastery</span>
          <span>{document.masteryPct}%</span>
        </div>
        <ProgressBar value={document.masteryPct} />
      </div>
      <Link href={`/documents/${document.id}`} className="w-auto">
        <Button variant="secondary" icon={<ArrowRightIcon />} className="w-auto px-6">
          {document.masteryPct === 100 ? "Review" : "Continue"}
        </Button>
      </Link>
    </Card>
  );
}

function DocumentCardSkeleton() {
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-8 rounded-lg" />
        <div className="flex-1">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="mt-2 h-3 w-1/3" />
        </div>
      </div>
      <Skeleton className="h-2 w-full rounded-full" />
      <Skeleton className="h-12 w-full rounded-xl" />
    </Card>
  );
}

function EmptyState() {
  return (
    <Card className="flex flex-col items-center gap-3 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent">
        <FileTextIcon />
      </span>
      <p className="font-medium">No documents yet</p>
      <p className="max-w-sm text-sm text-muted">
        Upload a text file or PDF to generate your first Learning Path and start building active recall.
      </p>
      <Link href="/documents/new" className="mt-2 w-auto">
        <Button icon={<PlusIcon />} className="w-auto px-6">
          New Document
        </Button>
      </Link>
    </Card>
  );
}
