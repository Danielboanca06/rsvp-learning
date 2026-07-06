"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { StopIcon, SearchIcon } from "@/components/ui/icons";
import { WordLookupPanel } from "@/components/vocabulary/WordLookupPanel";

export function RsvpPlayer({
  words,
  wpm,
  moduleTitle,
  documentId,
  chunkId,
  onComplete,
  onStop,
}: {
  words: string[];
  wpm: number;
  moduleTitle: string;
  documentId?: string;
  chunkId?: string;
  onComplete: () => void;
  onStop: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (words.length === 0) {
      onComplete();
      return;
    }

    if (isPaused) return;

    const msPerWord = Math.round(60000 / wpm);
    const interval = setInterval(() => {
      setIndex((current) => {
        if (current + 1 >= words.length) {
          clearInterval(interval);
          setTimeout(onComplete, 0);
          return current;
        }
        return current + 1;
      });
    }, msPerWord);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [words, wpm, isPaused]);

  const progress = words.length <= 1 ? 100 : (index / (words.length - 1)) * 100;

  return (
    <div className="flex flex-col items-center gap-10 py-10">
      <div className="flex w-full items-center justify-between text-xs text-muted">
        <span>{moduleTitle}</span>
        <span>{wpm} WPM</span>
      </div>

      <div className="relative flex h-32 w-full items-center justify-center">
        <div
          aria-hidden
          className="absolute h-40 w-40 rounded-full bg-accent-soft blur-3xl"
        />
        <motion.span
          key={index}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.12, ease: "easeOut" }}
          className="relative text-5xl font-bold tracking-tight"
        >
          {words[index]}
          <span className="absolute -bottom-2 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-accent/40" />
        </motion.span>
      </div>

      <div className="w-full">
        <ProgressBar value={progress} />
      </div>

      <div className="flex gap-3">
        <Button variant="secondary" icon={<SearchIcon />} onClick={() => setIsPaused(true)} className="w-auto px-8">
          Look Up Word
        </Button>
        <Button variant="secondary" icon={<StopIcon />} onClick={onStop} className="w-auto px-8">
          Stop
        </Button>
      </div>

      {isPaused && (
        <WordLookupPanel
          words={words}
          documentId={documentId}
          chunkId={chunkId}
          onClose={() => setIsPaused(false)}
        />
      )}
    </div>
  );
}
