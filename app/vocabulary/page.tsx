"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { TrashIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

type VocabularyWord = {
  id: string;
  word: string;
  definition: string;
  createdAt: string;
};

type Sort = "recent" | "az";

export default function VocabularyPage() {
  const [words, setWords] = useState<VocabularyWord[] | null>(null);
  const [sort, setSort] = useState<Sort>("recent");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/vocabulary?sort=${sort}`)
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled) setWords(json.words);
      });
    return () => {
      cancelled = true;
    };
  }, [sort]);

  async function handleDelete(id: string) {
    setWords((current) => current?.filter((word) => word.id !== id) ?? null);
    await fetch(`/api/vocabulary/${id}`, { method: "DELETE" });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl italic tracking-tight">Vocabulary</h1>
          <p className="mt-1 text-sm text-muted">Words you&apos;ve saved while reading.</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={sort === "recent" ? "primary" : "secondary"}
            onClick={() => setSort("recent")}
            className="w-auto px-4"
          >
            Recent
          </Button>
          <Button variant={sort === "az" ? "primary" : "secondary"} onClick={() => setSort("az")} className="w-auto px-4">
            A–Z
          </Button>
        </div>
      </div>

      {words === null ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : words.length === 0 ? (
        <Card className="py-12 text-center text-sm text-muted">
          No words saved yet. Look up a word during a reading session to add it here.
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {words.map((word) => (
            <Card key={word.id} className="flex items-start justify-between gap-4">
              <div>
                <p className={cn("font-medium capitalize leading-tight")}>{word.word}</p>
                <p className="mt-1 text-sm text-muted">{word.definition}</p>
              </div>
              <button
                onClick={() => handleDelete(word.id)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:border-danger/40 hover:text-danger"
                aria-label={`Remove ${word.word}`}
              >
                <TrashIcon />
              </button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
