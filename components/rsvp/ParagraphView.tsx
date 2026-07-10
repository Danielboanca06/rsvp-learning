"use client";

import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ArrowRightIcon, SearchIcon, StopIcon } from "@/components/ui/icons";
import { Markdown } from "@/components/ui/Markdown";
import { WordLookupPanel } from "@/components/vocabulary/WordLookupPanel";
import { SelectionDefinePopover } from "@/components/rsvp/SelectionDefinePopover";
import { markdownToWords } from "@/lib/markdown";

export function ParagraphView({
  content,
  moduleTitle,
  documentId,
  chunkId,
  onComplete,
  onStop,
  onAskAi,
}: {
  content: string;
  moduleTitle: string;
  documentId?: string;
  chunkId?: string;
  onComplete: () => void;
  onStop: () => void;
  onAskAi?: (text: string) => void;
}) {
  const [showLookup, setShowLookup] = useState(false);
  const paragraphsRef = useRef<HTMLDivElement>(null);

  const words = useMemo(() => markdownToWords(content), [content]);

  return (
    <div className="flex flex-col gap-8 py-10">
      <div className="flex w-full items-center justify-between text-xs text-muted">
        <span>{moduleTitle}</span>
        <span>{words.length} words</span>
      </div>

      <div ref={paragraphsRef} className="select-text rounded-2xl border border-border/60 bg-surface p-6">
        <Markdown size="reading">{content}</Markdown>
      </div>

      <p className="text-xs text-muted">
        Select any word or phrase above to look up its definition{onAskAi ? " or ask the AI about it" : ""}.
      </p>

      <SelectionDefinePopover
        containerRef={paragraphsRef}
        documentId={documentId}
        chunkId={chunkId}
        onAskAi={onAskAi}
      />

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
