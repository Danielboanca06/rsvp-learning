"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { ArrowRightIcon, LayersIcon, PlusIcon } from "@/components/ui/icons";

type Space = {
  id: string;
  name: string;
  isDefault: boolean;
  documentCount: number;
  createdAt: string;
};

export function SpacesGrid() {
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function load() {
    setLoading(true);
    fetch("/api/spaces")
      .then((res) => res.json())
      .then((json) => setSpaces(json.spaces ?? []))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate() {
    if (!newName.trim() || submitting) return;
    setSubmitting(true);
    try {
      const response = await fetch("/api/spaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (response.ok) {
        setNewName("");
        setCreating(false);
        load();
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-xl italic tracking-tight">Spaces</h2>
        {!loading && spaces.length > 0 && (
          <Link href="/spaces" className="flex items-center gap-1 text-xs text-accent">
            View all <ArrowRightIcon />
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {loading ? (
          <>
            {[0, 1, 2].map((index) => (
              <Card key={index} className="p-4">
                <Skeleton className="h-9 w-9 rounded-lg" />
                <Skeleton className="mt-3 h-3 w-2/3" />
                <Skeleton className="mt-2 h-2.5 w-1/3" />
              </Card>
            ))}
          </>
        ) : (
          <>
            {spaces.map((space) => (
              <Link key={space.id} href={`/spaces/${space.id}`}>
                <Card className="flex h-full flex-col gap-3 p-4 transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg">
                  <div className="flex items-center justify-between">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent">
                      <LayersIcon />
                    </span>
                    {space.isDefault && (
                      <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                        Default
                      </span>
                    )}
                  </div>
                  <div>
                    <p className="font-medium leading-tight">{space.name}</p>
                    <p className="mt-1 text-xs text-muted">
                      {space.documentCount} {space.documentCount === 1 ? "document" : "documents"}
                    </p>
                  </div>
                </Card>
              </Link>
            ))}

            {creating ? (
              <Card className="flex h-full flex-col justify-center gap-2 p-4">
                <input
                  autoFocus
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") handleCreate();
                    if (event.key === "Escape") setCreating(false);
                  }}
                  placeholder="Space name"
                  className="w-full rounded-lg border border-border bg-background p-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleCreate}
                    disabled={!newName.trim() || submitting}
                    className="flex-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition-colors duration-150 hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {submitting ? "Creating…" : "Create"}
                  </button>
                  <button
                    onClick={() => setCreating(false)}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors duration-150 hover:bg-surface-hover"
                  >
                    Cancel
                  </button>
                </div>
              </Card>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border text-muted transition-colors duration-200 hover:border-accent hover:text-accent"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent">
                  <PlusIcon />
                </span>
                <span className="text-xs font-medium">New space</span>
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
