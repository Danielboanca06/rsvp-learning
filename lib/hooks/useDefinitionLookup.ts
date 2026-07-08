"use client";

import { useState } from "react";

export function useDefinitionLookup(documentId?: string, chunkId?: string) {
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [loadingDefinition, setLoadingDefinition] = useState(false);
  const [definition, setDefinition] = useState<string | null>(null);
  const [manualDefinition, setManualDefinition] = useState("");
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState<Set<string>>(new Set());

  async function lookup(word: string) {
    setSelectedWord(word);
    setDefinition(null);
    setManualDefinition("");
    setLoadingDefinition(true);

    const response = await fetch("/api/vocabulary/define", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word }),
    });
    const json = await response.json();
    setLoadingDefinition(false);
    setDefinition(json.definition ?? null);
  }

  async function add() {
    if (!selectedWord) return;
    const finalDefinition = definition ?? manualDefinition.trim();
    if (!finalDefinition) return;

    setAdding(true);
    await fetch("/api/vocabulary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word: selectedWord, definition: finalDefinition, documentId, chunkId }),
    });
    setAdding(false);
    setAdded((prev) => new Set(prev).add(selectedWord.toLowerCase()));
  }

  function reset() {
    setSelectedWord(null);
    setDefinition(null);
    setManualDefinition("");
  }

  return {
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
  };
}
