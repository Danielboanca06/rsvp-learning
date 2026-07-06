"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import { SparklineChart } from "@/components/charts/SparklineChart";
import { ReviewCallout } from "@/components/dashboard/ReviewCallout";
import { DailyRecallCard } from "@/components/dashboard/DailyRecallCard";
import { DailyQuizCard } from "@/components/dashboard/DailyQuizCard";
import { DocumentCarousel } from "@/components/dashboard/DocumentCarousel";
import { DocumentCardSkeleton, type DocumentStat } from "@/components/dashboard/DocumentCard";
import { SpacesGrid } from "@/components/dashboard/SpacesGrid";
import { PlusIcon, FileTextIcon, ClockIcon, BrainIcon } from "@/components/ui/icons";

type AnalyticsResponse = {
  documents: DocumentStat[];
  recentDocuments: DocumentStat[];
  scoreHistory: { createdAt: string; score: number }[];
  wpmHistory: { createdAt: string; wpm: number }[];
  totals: { documentCount: number; attemptCount: number; averageScore: number | null };
  review: { dueCount: number; nextDueAt: string | null };
};

export function DashboardView({
  analyticsUrl,
  quizFetchUrl,
  quizRegenerateUrl,
  showDailyRecall,
  showSpaces = false,
  title,
  subtitle,
  newDocumentHref,
}: {
  analyticsUrl: string;
  quizFetchUrl: string;
  quizRegenerateUrl: string;
  showDailyRecall: boolean;
  showSpaces?: boolean;
  title: string;
  subtitle: string;
  newDocumentHref: string;
}) {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [points, setPoints] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setData(null);

    Promise.all([
      fetch(analyticsUrl).then((res) => res.json()),
      fetch("/api/points").then((res) => res.json()),
    ])
      .then(([analyticsJson, pointsJson]) => {
        if (cancelled) return;
        setData(analyticsJson);
        setPoints(pointsJson.total ?? 0);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [analyticsUrl]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl italic tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-muted">{subtitle}</p>
        </div>
        <Link href={newDocumentHref} className="w-auto">
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

      {loading ? <StatsSkeleton /> : <StatsRow totals={data!.totals} points={points} />}

      {!loading && showDailyRecall && <DailyRecallCard />}
      {!loading && <DailyQuizCard fetchUrl={quizFetchUrl} regenerateUrl={quizRegenerateUrl} />}

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
              <SparklineChart data={data!.scoreHistory.map((point) => point.score)} color="var(--color-accent)" />
            </Card>
            <Card>
              <p className="text-sm font-medium text-muted">Reading speed progression (WPM)</p>
              <SparklineChart data={data!.wpmHistory.map((point) => point.wpm)} color="var(--color-success)" />
            </Card>
          </>
        )}
      </div>

      <div>
        <h2 className="mb-4 font-display text-xl italic tracking-tight">Recently studied</h2>
        {loading ? (
          <div className="flex gap-4 overflow-x-auto pb-2">
            <div className="w-[260px] shrink-0">
              <DocumentCardSkeleton />
            </div>
            <div className="w-[260px] shrink-0">
              <DocumentCardSkeleton />
            </div>
          </div>
        ) : data!.recentDocuments.length === 0 ? (
          <EmptyState newDocumentHref={newDocumentHref} />
        ) : (
          <DocumentCarousel documents={sortMasteredFirst(data!.recentDocuments)} />
        )}
      </div>

      {showSpaces && <SpacesGrid />}
    </div>
  );
}

function sortMasteredFirst(documents: DocumentStat[]) {
  const mastered = (document: DocumentStat) => document.totalChunks > 0 && document.masteryPct === 100;
  return [...documents].sort((a, b) => Number(mastered(b)) - Number(mastered(a)));
}

function StatsRow({ totals, points }: { totals: AnalyticsResponse["totals"]; points: number }) {
  const secondary = [
    { label: "Documents", value: totals.documentCount },
    { label: "Attempts graded", value: totals.attemptCount },
    { label: "Average score", value: totals.averageScore === null ? "—" : `${totals.averageScore}/100` },
  ];

  return (
    <Card className="flex flex-col gap-6 sm:flex-row sm:items-center">
      <div className="flex items-center gap-4 sm:border-r sm:border-border sm:pr-8">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
          <BrainIcon />
        </span>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">IQ Points</p>
          <p className="font-display text-4xl italic leading-none text-accent">{points}</p>
        </div>
      </div>
      <div className="grid flex-1 grid-cols-3 gap-4 sm:pl-8">
        {secondary.map((item) => (
          <div key={item.label}>
            <p className="text-xs uppercase tracking-wide text-muted">{item.label}</p>
            <p className="mt-1.5 text-xl font-semibold">{item.value}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function StatsSkeleton() {
  return (
    <Card className="flex flex-col gap-6 sm:flex-row sm:items-center">
      <div className="flex items-center gap-4 sm:border-r sm:border-border sm:pr-8">
        <Skeleton className="h-12 w-12 rounded-full" />
        <div>
          <Skeleton className="h-3 w-16" />
          <Skeleton className="mt-2 h-8 w-14" />
        </div>
      </div>
      <div className="grid flex-1 grid-cols-3 gap-4 sm:pl-8">
        {[0, 1, 2].map((index) => (
          <div key={index}>
            <Skeleton className="h-3 w-16" />
            <Skeleton className="mt-2 h-5 w-10" />
          </div>
        ))}
      </div>
    </Card>
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

function EmptyState({ newDocumentHref }: { newDocumentHref: string }) {
  return (
    <Card className="flex flex-col items-center gap-3 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent">
        <FileTextIcon />
      </span>
      <p className="font-medium">No documents yet</p>
      <p className="max-w-sm text-sm text-muted">
        Upload a text file or PDF to generate your first Learning Path and start building active recall.
      </p>
      <Link href={newDocumentHref} className="mt-2 w-auto">
        <Button icon={<PlusIcon />} className="w-auto px-6">
          New Document
        </Button>
      </Link>
    </Card>
  );
}
