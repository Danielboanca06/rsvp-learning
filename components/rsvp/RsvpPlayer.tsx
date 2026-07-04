"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { StopIcon } from "@/components/ui/icons";

export function RsvpPlayer({
  words,
  wpm,
  moduleTitle,
  onComplete,
  onStop,
}: {
  words: string[];
  wpm: number;
  moduleTitle: string;
  onComplete: () => void;
  onStop: () => void;
}) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (words.length === 0) {
      onComplete();
      return;
    }

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
  }, [words, wpm]);

  const progress = words.length <= 1 ? 100 : (index / (words.length - 1)) * 100;

  return (
    <div className="flex flex-col items-center gap-10 py-10">
      <div className="flex w-full items-center justify-between text-xs text-muted">
        <span>{moduleTitle}</span>
        <span>{wpm} WPM</span>
      </div>

      <div className="flex h-32 w-full items-center justify-center">
        <motion.span
          key={index}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.08 }}
          className="text-5xl font-bold tracking-tight"
        >
          {words[index]}
        </motion.span>
      </div>

      <div className="w-full">
        <ProgressBar value={progress} />
      </div>

      <Button variant="secondary" icon={<StopIcon />} onClick={onStop} className="w-auto px-8">
        Stop
      </Button>
    </div>
  );
}
