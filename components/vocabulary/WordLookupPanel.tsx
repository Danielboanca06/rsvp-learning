"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { CheckIcon, SearchIcon, XIcon } from "@/components/ui/icons";
import { useDefinitionLookup } from "@/lib/hooks/useDefinitionLookup";

const SEARCH_THRESHOLD = 20;

function uniqueWords(words: string[]): string[] {
  const seen = new Map<string, string>();
  for (const raw of words) {
    const cleaned = raw.replace(/^[^a-zA-Z']+|[^a-zA-Z']+$/g, "");
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (!seen.has(key)) seen.set(key, cleaned);
  }
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
}

export function WordLookupPanel({
  words,
  documentId,
  chunkId,
  onClose,
}: {
  words: string[];
  documentId?: string;
  chunkId?: string;
  onClose: () => void;
}) {
  const wordList = useMemo(() => uniqueWords(words), [words]);
  const [query, setQuery] = useState("");
  const {
    selectedWord,
    loadingDefinition,
    definition,
    manualDefinition,
    setManualDefinition,
    adding,
    added,
    lookup,
    add,
    reset,
  } = useDefinitionLookup(documentId, chunkId);

  const filteredWords = query.trim()
    ? wordList.filter((word) => word.toLowerCase().includes(query.trim().toLowerCase()))
    : wordList;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[oklch(15%_0.02_50/55%)] p-4 backdrop-blur-sm">
      <Card className="flex max-h-[80vh] w-full max-w-md flex-col gap-4 shadow-lg">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl italic tracking-tight">Look up a word</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:text-foreground"
            aria-label="Close and resume"
          >
            <XIcon />
          </button>
        </div>

        {selectedWord === null ? (
          <div className="flex flex-1 flex-col gap-3 overflow-hidden">
            {wordList.length > SEARCH_THRESHOLD && (
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
                  <SearchIcon />
                </span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search words..."
                  className="w-full rounded-xl border border-border bg-surface py-2.5 pl-10 pr-3 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  autoFocus
                />
              </div>
            )}
            <div className="flex flex-wrap gap-2 overflow-y-auto">
              {filteredWords.map((word) => (
                <button
                  key={word}
                  onClick={() => lookup(word)}
                  className="rounded-full border border-border bg-background px-3 py-1.5 text-sm transition-colors hover:border-accent hover:text-accent"
                >
                  {word}
                  {added.has(word.toLowerCase()) && (
                    <span className="ml-1.5 inline-flex text-success [&>svg]:h-3.5 [&>svg]:w-3.5">
                      <CheckIcon />
                    </span>
                  )}
                </button>
              ))}
              {filteredWords.length === 0 && <p className="text-sm text-muted">No matching words.</p>}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <button onClick={reset} className="w-fit text-xs text-muted transition-colors hover:text-foreground">
              ← Back to word list
            </button>
            <p className="font-display text-2xl italic tracking-tight">{selectedWord}</p>

            {loadingDefinition ? (
              <p className="text-sm text-muted">Looking up definition...</p>
            ) : definition ? (
              <p className="rounded-lg border border-border bg-background p-3 text-sm text-foreground/90">{definition}</p>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-muted">No definition found. You can write your own:</p>
                <Textarea
                  value={manualDefinition}
                  onChange={(event) => setManualDefinition(event.target.value)}
                  placeholder="Enter a definition..."
                  className="h-20"
                />
              </div>
            )}

            <Button
              icon={<CheckIcon />}
              loading={adding}
              disabled={added.has(selectedWord.toLowerCase()) || (!definition && manualDefinition.trim().length === 0)}
              onClick={add}
              className="w-auto px-6"
            >
              {added.has(selectedWord.toLowerCase()) ? "Added to Vocabulary" : "Add to Vocabulary"}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
