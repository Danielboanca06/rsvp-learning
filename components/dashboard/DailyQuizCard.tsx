"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { HelpCircleIcon, RefreshIcon } from "@/components/ui/icons";
import { QuizRunner, type QuizData } from "@/components/quiz/QuizRunner";

const QUIZ_CORRECT_POINTS = 4;

export function DailyQuizCard({
  fetchUrl = "/api/quizzes/daily",
  regenerateUrl = "/api/quizzes/daily/regenerate",
}: {
  fetchUrl?: string;
  regenerateUrl?: string;
} = {}) {
  const [quiz, setQuiz] = useState<QuizData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [finalScore, setFinalScore] = useState<number | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setQuiz(null);
    setFinalScore(null);
    fetch(fetchUrl)
      .then((res) => res.json())
      .then((json: QuizData) => {
        if (!cancelled) setQuiz(json);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchUrl]);

  async function handleRegenerate() {
    setRegenerating(true);
    const response = await fetch(regenerateUrl, { method: "POST" });
    const json: QuizData = await response.json();
    setRegenerating(false);
    setQuiz(json);
    setFinalScore(null);
  }

  if (!loaded || !quiz) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      <Card className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
            <HelpCircleIcon />
          </span>
          <div>
            <p className="font-medium leading-tight">Daily Quiz</p>
            <p className="mt-0.5 text-xs text-muted">
              A quick multiple-choice check on what you&apos;ve learned recently and what you&apos;ve struggled with.
            </p>
          </div>
        </div>

        {quiz.items.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted">
            Study a few modules first — your daily quiz will appear here once you have material to draw from.
          </p>
        ) : finalScore !== null ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium text-success">
              You scored {finalScore}/{quiz.totalQuestions} — +{finalScore * QUIZ_CORRECT_POINTS} IQ points
            </p>
            <Button
              variant="secondary"
              icon={<RefreshIcon />}
              loading={regenerating}
              onClick={handleRegenerate}
              className="w-auto px-6"
            >
              Regenerate
            </Button>
          </div>
        ) : (
          <QuizRunner quiz={quiz} onComplete={setFinalScore} />
        )}
      </Card>
    </motion.div>
  );
}
