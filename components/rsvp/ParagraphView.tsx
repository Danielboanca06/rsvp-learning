"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ArrowRightIcon, SearchIcon, StopIcon } from "@/components/ui/icons";
import { WordLookupPanel } from "@/components/vocabulary/WordLookupPanel";

export function ParagraphView({
  content,
  moduleTitle,
  documentId,
  chunkId,
  onComplete,
  onStop,
}: {
  content: string;
  moduleTitle: string;
  documentId?: string;
  chunkId?: string;
  onComplete: () => void;
  onStop: () => void;
}) {
  const [showLookup, setShowLookup] = useState(false);

  const paragraphs = useMemo(() => {
    const parts = content
      .split(/\n\s*\n/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean);
    return parts.length > 0 ? parts : [content];
  }, [content]);

  const words = useMemo(() => content.split(/\s+/).filter(Boolean), [content]);

  return (
    <div className="flex flex-col gap-8 py-10">
      <div className="flex w-full items-center justify-between text-xs text-muted">
        <span>{moduleTitle}</span>
        <span>{words.length} words</span>
      </div>

      <div className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-surface p-6">
        {paragraphs.map((paragraph, index) => (
          <p key={index} className="text-lg leading-relaxed text-foreground/90">
            {paragraph}
          </p>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" icon={<SearchIcon />} onClick={() => setShowLookup(true)} className="w-auto px-8">
          Look Up Word
        </Button>
        <Button variant="secondary" icon={<StopIcon />} onClick={onStop} className="w-auto px-8">
          Stop
        </Button>
        <Button icon={<ArrowRightIcon />} onClick={onComplete} className="w-auto px-8">
          Continue
        </Button>
      </div>

      {showLookup && (
        <WordLookupPanel
          words={words}
          documentId={documentId}
          chunkId={chunkId}
          onClose={() => setShowLookup(false)}
        />
      )}
    </div>
  );
}
