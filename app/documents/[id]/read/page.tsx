"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { RsvpPlayer } from "@/components/rsvp/RsvpPlayer";
import { ParagraphView } from "@/components/rsvp/ParagraphView";
import { ReadingModeToggle, type ReadingMode } from "@/components/rsvp/ReadingModeToggle";
import { SummaryForm } from "@/components/rsvp/SummaryForm";
import { SocraticFeedback } from "@/components/rsvp/SocraticFeedback";
import { PassBanner } from "@/components/rsvp/PassBanner";
import { SessionComplete } from "@/components/rsvp/SessionComplete";
import { QuizRunner, type QuizData } from "@/components/quiz/QuizRunner";
import { UpgradePrompt } from "@/components/billing/UpgradePrompt";
import { SelectionChatPanel } from "@/components/chat/SelectionChatPanel";

type Chunk = {
  id: string;
  order: number;
  title: string;
  content: string;
  wordCount: number;
  sectionTitle: string | null;
  keyPoints: string[] | null;
};

// Sub-modules carry their parent section for context, e.g. "Photosynthesis · Light reactions".
function chunkLabel(chunk: Chunk): string {
  return chunk.sectionTitle && chunk.sectionTitle !== chunk.title
    ? `${chunk.sectionTitle} · ${chunk.title}`
    : chunk.title;
}

type AttemptResult = {
  score: number;
  hint: string;
  socraticQuestion: string | null;
  passed: boolean;
  newWpm: number;
  nextChunk: Chunk | null;
  documentComplete: boolean;
  quizAvailable: { chunkId: string } | null;
};

type View = "loading" | "rsvp" | "summary" | "pass" | "quiz" | "fail" | "complete" | "error" | "upgrade";

function ReadSessionInner() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionId = searchParams.get("session");

  const [view, setView] = useState<View>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentChunk, setCurrentChunk] = useState<Chunk | null>(null);
  const [wpm, setWpm] = useState(250);
  const [readingMode, setReadingMode] = useState<ReadingMode>("rsvp");
  const [grading, setGrading] = useState(false);
  const [retrySummary, setRetrySummary] = useState("");
  const [lastResult, setLastResult] = useState<AttemptResult | null>(null);
  const [averageScore, setAverageScore] = useState<number | null>(null);
  const [quizData, setQuizData] = useState<QuizData | null>(null);
  // "Ask AI" chat, anchored to the highlighted passage. Keyed by chunk so a
  // new selection replaces the conversation instead of appending to it.
  const [askAi, setAskAi] = useState<{ chunkId: string; selectionText: string } | null>(null);
  const wpmPersistTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleWpmChange = useCallback(
    (newWpm: number) => {
      setWpm(newWpm);
      if (!sessionId) return;

      if (wpmPersistTimeout.current) clearTimeout(wpmPersistTimeout.current);
      wpmPersistTimeout.current = setTimeout(() => {
        fetch(`/api/sessions/${sessionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ currentWpm: newWpm }),
        }).catch(() => {});
      }, 400);
    },
    [sessionId]
  );

  useEffect(() => {
    return () => {
      if (wpmPersistTimeout.current) clearTimeout(wpmPersistTimeout.current);
    };
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem("reading-mode");
    if (stored === "rsvp" || stored === "paragraph") {
      setReadingMode(stored);
    }
  }, []);

  function handleReadingModeChange(mode: ReadingMode) {
    setReadingMode(mode);
    window.localStorage.setItem("reading-mode", mode);
  }

  useEffect(() => {
    if (!sessionId) return;

    let cancelled = false;

    async function bootstrap() {
      const sessionRes = await fetch(`/api/sessions/${sessionId}`);
      if (!sessionRes.ok) {
        if (!cancelled) {
          setView("error");
          setErrorMessage("This session could not be found.");
        }
        return;
      }
      const { session } = await sessionRes.json();

      const documentRes = await fetch(`/api/documents/${session.documentId}`);
      const { document, masteredChunkIds } = await documentRes.json();
      const masteredSet = new Set<string>(masteredChunkIds);
      const nextChunk = document.chunks.find((chunk: Chunk) => !masteredSet.has(chunk.id)) ?? document.chunks[0];

      if (cancelled) return;
      setWpm(session.currentWpm);
      setCurrentChunk(nextChunk);
      setView("rsvp");
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const handleStop = useCallback(async () => {
    if (!sessionId) return;
    await fetch(`/api/sessions/${sessionId}/complete`, { method: "POST" });
    router.push(`/documents/${params.id}`);
  }, [sessionId, params.id, router]);

  async function handleSubmitSummary(summary: string) {
    if (!sessionId || !currentChunk) return;
    setGrading(true);

    const response = await fetch(`/api/sessions/${sessionId}/attempts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chunkId: currentChunk.id, summary }),
    });

    if (response.status === 429) {
      const body = await response.json().catch(() => ({}));
      setGrading(false);
      setErrorMessage(body.error ?? "AI quota reached.");
      setView("upgrade");
      return;
    }

    const result: AttemptResult = await response.json();

    setGrading(false);
    setWpm(result.newWpm);
    setLastResult(result);

    if (!result.passed) {
      setRetrySummary(summary);
      setView("fail");
      return;
    }

    if (result.documentComplete) {
      const historyRes = await fetch(`/api/documents/${params.id}/history`);
      const { attempts } = await historyRes.json();
      if (attempts.length > 0) {
        const avg = Math.round(
          attempts.reduce((sum: number, attempt: { score: number }) => sum + attempt.score, 0) / attempts.length
        );
        setAverageScore(avg);
      }
      setView("complete");
      return;
    }

    setView("pass");
  }

  function handleReadAgain() {
    setRetrySummary(retrySummary);
    setView("rsvp");
  }

  function advanceToNextChunk() {
    if (lastResult?.nextChunk) {
      setCurrentChunk(lastResult.nextChunk);
      setView("rsvp");
    }
  }

  function handlePassContinue() {
    if (lastResult?.quizAvailable) {
      const { chunkId } = lastResult.quizAvailable;
      setQuizData(null);
      setView("quiz");
      fetch("/api/quizzes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chunkId }),
      })
        .then((res) => res.json())
        .then((json: QuizData) => setQuizData(json));
      return;
    }
    advanceToNextChunk();
  }

  function handleQuizComplete() {
    setQuizData(null);
    advanceToNextChunk();
  }

  if (view === "loading") {
    return <ReadSkeleton />;
  }

  if (!sessionId) {
    return (
      <Card className="mx-auto max-w-md text-center">
        <p className="text-sm text-danger">No session was specified.</p>
      </Card>
    );
  }

  if (view === "error") {
    return (
      <Card className="mx-auto max-w-md text-center">
        <p className="text-sm text-danger">{errorMessage}</p>
      </Card>
    );
  }

  if (view === "upgrade") {
    return (
      <div className="mx-auto max-w-md">
        <UpgradePrompt message={errorMessage ?? "AI quota reached."} />
      </div>
    );
  }

  if (view === "complete") {
    return <SessionComplete documentId={params.id} finalWpm={wpm} averageScore={averageScore} />;
  }

  return (
    // The reading column stays centered until the AI chat opens; then it
    // shifts left (layout animation) to make room for the side panel.
    <div className="mx-auto flex w-full max-w-5xl items-start justify-center gap-6">
      <motion.div layout transition={{ type: "spring", stiffness: 260, damping: 30 }} className="w-full min-w-0 max-w-xl">
        <AnimatePresence mode="wait">
        <motion.div
          key={view}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          {view === "rsvp" && currentChunk && (
            <div className="flex flex-col gap-4">
              <div className="flex justify-end">
                <ReadingModeToggle mode={readingMode} onChange={handleReadingModeChange} />
              </div>
              {readingMode === "rsvp" ? (
                <RsvpPlayer
                  words={currentChunk.content.split(/\s+/).filter(Boolean)}
                  wpm={wpm}
                  moduleTitle={chunkLabel(currentChunk)}
                  documentId={params.id}
                  chunkId={currentChunk.id}
                  onComplete={() => setView("summary")}
                  onStop={handleStop}
                  onWpmChange={handleWpmChange}
                />
              ) : (
                <ParagraphView
                  content={currentChunk.content}
                  moduleTitle={chunkLabel(currentChunk)}
                  documentId={params.id}
                  chunkId={currentChunk.id}
                  onComplete={() => setView("summary")}
                  onStop={handleStop}
                  onAskAi={(text) => setAskAi({ chunkId: currentChunk.id, selectionText: text })}
                />
              )}
            </div>
          )}
          {view === "summary" && currentChunk && (
            <SummaryForm
              moduleTitle={chunkLabel(currentChunk)}
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
              keyPoints={currentChunk?.keyPoints ?? undefined}
              newWpm={lastResult.newWpm}
              onContinue={handlePassContinue}
            />
          )}
          {view === "quiz" &&
            (quizData ? (
              <QuizRunner quiz={quizData} onComplete={handleQuizComplete} />
            ) : (
              <div className="flex flex-col gap-4 py-4">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-32 w-full rounded-2xl" />
              </div>
            ))}
          </motion.div>
        </AnimatePresence>
      </motion.div>

      <AnimatePresence>
        {askAi && (
          <motion.aside
            key="ask-ai-panel"
            initial={{ opacity: 0, x: 32 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 32 }}
            transition={{ type: "spring", stiffness: 260, damping: 30 }}
            className="fixed inset-x-0 bottom-0 top-16 z-40 bg-background/80 p-4 backdrop-blur-sm md:static md:inset-auto md:z-auto md:w-96 md:shrink-0 md:bg-transparent md:p-0 md:backdrop-blur-none"
          >
            <div className="h-full md:sticky md:top-6 md:h-[calc(100vh-10rem)] md:min-h-[24rem]">
              <SelectionChatPanel
                key={`${askAi.chunkId}:${askAi.selectionText}`}
                documentId={params.id}
                chunkId={askAi.chunkId}
                selectionText={askAi.selectionText}
                onClose={() => setAskAi(null)}
              />
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}

function ReadSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-8 py-10">
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-16 w-2/3" />
      <Skeleton className="h-2 w-full rounded-full" />
      <Skeleton className="h-12 w-32 rounded-xl" />
    </div>
  );
}

export default function ReadSessionPage() {
  return (
    <Suspense fallback={<ReadSkeleton />}>
      <ReadSessionInner />
    </Suspense>
  );
}
