"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { BrainIcon, CheckIcon } from "@/components/ui/icons";
import { UpgradePrompt } from "@/components/billing/UpgradePrompt";
import { cn } from "@/lib/cn";

type DailyWord = { id: string; word: string } | null;

type RecallResult = {
  correct: boolean;
  score: number;
  feedback: string;
  actualDefinition: string;
};

export function DailyRecallCard() {
  const [word, setWord] = useState<DailyWord>(null);
  const [loaded, setLoaded] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [definition, setDefinition] = useState("");
  const [grading, setGrading] = useState(false);
  const [result, setResult] = useState<RecallResult | null>(null);
  const [quotaMessage, setQuotaMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/vocabulary/daily")
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled) setWord(json.word);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loaded || !word) return null;

  async function handleSubmit() {
    if (!word || definition.trim().length === 0) return;
    setGrading(true);
    const response = await fetch(`/api/vocabulary/${word.id}/recall`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ definition: definition.trim() }),
    });

    if (response.status === 429) {
      const body = await response.json().catch(() => ({}));
      setGrading(false);
      setQuotaMessage(body.error ?? "AI quota reached.");
      return;
    }

    const json: RecallResult = await response.json();
    setGrading(false);
    setResult(json);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      <Card className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
            <BrainIcon />
          </span>
          <div>
            <p className="font-medium leading-tight">Daily Recall</p>
            <p className="mt-0.5 text-xs text-muted">Define this word from your vocabulary to earn IQ points.</p>
          </div>
        </div>

        {quotaMessage ? (
          <UpgradePrompt message={quotaMessage} />
        ) : !revealed ? (
          <div className="flex flex-col items-center gap-4 py-4">
            <p className="font-display text-3xl italic tracking-tight capitalize">{word.word}</p>
            <Button onClick={() => setRevealed(true)} className="w-auto px-8">
              Recall Definition
            </Button>
          </div>
        ) : result ? (
          <div className="flex flex-col gap-2">
            <p className={cn("text-sm font-medium", result.correct ? "text-success" : "text-danger")}>
              {result.correct ? `Correct! +15 IQ points` : "Not quite"}
            </p>
            <p className="text-sm text-muted">{result.feedback}</p>
            <p className="rounded-lg border border-border bg-background p-3 text-sm text-foreground/90">
              {result.actualDefinition}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted">
              What does <span className="font-medium capitalize text-foreground">{word.word}</span> mean?
            </p>
            <Textarea
              value={definition}
              onChange={(event) => setDefinition(event.target.value)}
              placeholder="Type your definition..."
              className="h-24"
              disabled={grading}
              autoFocus
            />
            <Button
              icon={<CheckIcon />}
              loading={grading}
              disabled={definition.trim().length === 0}
              onClick={handleSubmit}
              className="w-auto px-8"
            >
              {grading ? "Grading..." : "Submit"}
            </Button>
          </div>
        )}
      </Card>
    </motion.div>
  );
}
