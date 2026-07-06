"use client";

import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { QuizQuestionCard } from "./QuizQuestionCard";

export type QuizItemData = {
  quizItemId: string;
  question: string;
  options: string[];
};

export type QuizData = {
  quizId: string;
  kind: string;
  status: string;
  score: number;
  totalQuestions: number;
  items: QuizItemData[];
};

export function QuizRunner({ quiz, onComplete }: { quiz: QuizData; onComplete: (finalScore: number) => void }) {
  const [index, setIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [revealed, setRevealed] = useState<{ selectedIndex: number; correctIndex: number } | null>(null);

  const currentItem = quiz.items[index];
  if (!currentItem) return null;

  async function handleSelect(selectedIndex: number) {
    if (submitting || revealed) return;
    setSubmitting(true);

    const response = await fetch(`/api/quizzes/${quiz.quizId}/answers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quizItemId: currentItem.quizItemId, selectedIndex }),
    });
    const result: { correct: boolean; correctIndex: number } = await response.json();

    setSubmitting(false);
    setRevealed({ selectedIndex, correctIndex: result.correctIndex });
    const nextCorrectCount = correctCount + (result.correct ? 1 : 0);
    setCorrectCount(nextCorrectCount);

    setTimeout(() => {
      if (index + 1 >= quiz.items.length) {
        onComplete(nextCorrectCount);
      } else {
        setRevealed(null);
        setIndex((current) => current + 1);
      }
    }, 1400);
  }

  return (
    <AnimatePresence mode="wait">
      <QuizQuestionCard
        key={currentItem.quizItemId}
        question={currentItem.question}
        options={currentItem.options}
        questionNumber={index + 1}
        totalQuestions={quiz.items.length}
        selectedIndex={revealed?.selectedIndex ?? null}
        correctIndex={revealed?.correctIndex ?? null}
        disabled={submitting || revealed !== null}
        onSelect={handleSelect}
      />
    </AnimatePresence>
  );
}
