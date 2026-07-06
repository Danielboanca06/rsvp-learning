"use client";

import { motion } from "framer-motion";
import { Card } from "@/components/ui/Card";
import { CheckIcon, XIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

export function QuizQuestionCard({
  question,
  options,
  questionNumber,
  totalQuestions,
  selectedIndex,
  correctIndex,
  disabled,
  onSelect,
}: {
  question: string;
  options: string[];
  questionNumber: number;
  totalQuestions: number;
  selectedIndex: number | null;
  correctIndex: number | null;
  disabled: boolean;
  onSelect: (index: number) => void;
}) {
  const revealed = correctIndex !== null;

  return (
    <motion.div
      key={questionNumber}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col gap-4"
    >
      <p className="text-xs uppercase tracking-wide text-muted">
        Question {questionNumber} of {totalQuestions}
      </p>
      <Card>
        <p className="font-display text-xl italic leading-snug">{question}</p>
        <div className="mt-5 flex flex-col gap-2.5">
          {options.map((option, index) => {
            const isSelected = selectedIndex === index;
            const isCorrectOption = correctIndex === index;
            const letter = String.fromCharCode(65 + index);

            return (
              <button
                key={index}
                type="button"
                disabled={disabled}
                onClick={() => onSelect(index)}
                className={cn(
                  "flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3 text-left text-sm transition-colors",
                  !revealed && "hover:border-accent/50 hover:bg-accent-soft",
                  disabled && !revealed && "cursor-not-allowed opacity-60",
                  revealed && isCorrectOption && "border-success/40 bg-success-soft text-success",
                  revealed && isSelected && !isCorrectOption && "border-danger/40 bg-danger-soft text-danger"
                )}
              >
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium",
                    revealed && isCorrectOption
                      ? "bg-success text-accent-foreground"
                      : revealed && isSelected
                        ? "bg-danger text-accent-foreground"
                        : "bg-surface-hover text-muted"
                  )}
                >
                  {letter}
                </span>
                <span className="flex-1">{option}</span>
                {revealed && isCorrectOption && <CheckIcon />}
                {revealed && isSelected && !isCorrectOption && <XIcon />}
              </button>
            );
          })}
        </div>
      </Card>
    </motion.div>
  );
}
