"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { RsvpPlayer } from "@/components/rsvp/RsvpPlayer";
import { SummaryForm } from "@/components/rsvp/SummaryForm";
import { SocraticFeedback } from "@/components/rsvp/SocraticFeedback";
import { PassBanner } from "@/components/rsvp/PassBanner";
import { ReviewComplete } from "@/components/rsvp/ReviewComplete";
import { ClockIcon, ArrowRightIcon } from "@/components/ui/icons";
import { markdownToWords } from "@/lib/markdown";

type DueChunk = {
  id: string;
  title: string;
  content: string;
  wordCount: number;
  document: { id: string; title: string };
};

type AttemptResult = {
  score: number;
  hint: string;
  socraticQuestion: string | null;
  passed: boolean;
  newWpm: number;
};

type View = "loading" | "empty" | "rsvp" | "summary" | "pass" | "fail" | "complete";

export default function ReviewPage() {
  const router = useRouter();
  const [view, setView] = useState<View>("loading");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [queue, setQueue] = useState<DueChunk[]>([]);
  const [index, setIndex] = useState(0);
  const [wpm, setWpm] = useState(250);
  const [grading, setGrading] = useState(false);
  const [retrySummary, setRetrySummary] = useState("");
  const [lastResult, setLastResult] = useState<AttemptResult | null>(null);
  const [scores, setScores] = useState<number[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const res = await fetch("/api/reviews", { method: "POST" });
      const json = await res.json();
      if (cancelled) return;

      if (!res.ok) {
        setView("empty");
        return;
      }

      setSessionId(json.session.id);
      setQueue(json.chunks);
      setWpm(json.session.currentWpm);
      setView("rsvp");
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  const currentChunk = queue[index] ?? null;

  const finishSession = useCallback(async () => {
    if (sessionId) {
      await fetch(`/api/sessions/${sessionId}/complete`, { method: "POST" });
    }
    setView("complete");
  }, [sessionId]);

  const handleStop = useCallback(async () => {
    if (sessionId) {
      await fetch(`/api/sessions/${sessionId}/complete`, { method: "POST" });
    }
    router.push("/");
  }, [sessionId, router]);

  async function handleSubmitSummary(summary: string) {
    if (!sessionId || !currentChunk) return;
    setGrading(true);

    const response = await fetch(`/api/sessions/${sessionId}/attempts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chunkId: currentChunk.id, summary }),
    });
    const result: AttemptResult = await response.json();

    setGrading(false);
    setWpm(result.newWpm);
    setLastResult(result);
    setScores((prev) => [...prev, result.score]);

    if (!result.passed) {
      setRetrySummary(summary);
      setView("fail");
      return;
    }

    setView("pass");
  }

  function handleReadAgain() {
    setView("rsvp");
  }

  function handlePassContinue() {
    const nextIndex = index + 1;
    if (nextIndex >= queue.length) {
      finishSession();
      return;
    }
    setIndex(nextIndex);
    setRetrySummary("");
    setView("rsvp");
  }

  if (view === "loading") {
    return <ReviewSkeleton />;
  }

  if (view === "empty") {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-success-soft text-success">
          <ClockIcon />
        </span>
        <h1 className="font-display text-2xl italic tracking-tight">You&apos;re all caught up</h1>
        <p className="max-w-sm text-sm text-muted">Nothing is due for review right now — check back later.</p>
        <Link href="/" className="mt-2 w-auto">
          <Button icon={<ArrowRightIcon />} className="w-auto px-8">
            Back to Dashboard
          </Button>
        </Link>
      </div>
    );
  }

  if (view === "complete") {
    return (
      <ReviewComplete
        reviewedCount={queue.length}
        averageScore={scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl">
      <div className="mb-6 flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs text-muted">
          <span>
            Review {index + 1} of {queue.length}
          </span>
          <span className="truncate">{currentChunk?.document.title}</span>
        </div>
        <ProgressBar value={(index / queue.length) * 100} />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={`${view}-${index}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          {view === "rsvp" && currentChunk && (
            <RsvpPlayer
              words={markdownToWords(currentChunk.content)}
              wpm={wpm}
              moduleTitle={currentChunk.title}
              documentId={currentChunk.document.id}
              chunkId={currentChunk.id}
              onComplete={() => setView("summary")}
              onStop={handleStop}
            />
          )}
          {view === "summary" && currentChunk && (
            <SummaryForm
              moduleTitle={currentChunk.title}
              initialValue={retrySummary}
              grading={grading}
              onSubmit={handleSubmitSummary}
            />
          )}
          {view === "fail" && lastResult && (
            <SocraticFeedback
              score={lastResult.score}
              hint={lastResult.hint}
              socraticQuestion={lastResult.socraticQuestion}
              newWpm={lastResult.newWpm}
              onReadAgain={handleReadAgain}
            />
          )}
          {view === "pass" && lastResult && (
            <PassBanner
              score={lastResult.score}
              hint={lastResult.hint}
              newWpm={lastResult.newWpm}
              onContinue={handlePassContinue}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function ReviewSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-8 py-10">
      <Card className="w-full">
        <Skeleton className="h-3 w-24" />
      </Card>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-16 w-2/3" />
      <Skeleton className="h-2 w-full rounded-full" />
      <Skeleton className="h-12 w-32 rounded-xl" />
    </div>
  );
}
