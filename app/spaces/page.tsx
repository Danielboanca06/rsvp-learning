"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { PlusIcon, LayersIcon, ArrowRightIcon } from "@/components/ui/icons";

type Space = {
  id: string;
  name: string;
  isDefault: boolean;
  documentCount: number;
  createdAt: string;
};

export default function SpacesPage() {
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    load();
  }, []);

  function load() {
    setLoading(true);
    fetch("/api/spaces")
      .then((res) => res.json())
      .then((json) => setSpaces(json.spaces ?? []))
      .finally(() => setLoading(false));
  }

  async function handleCreate() {
    if (!newName.trim() || submitting) return;
    setSubmitting(true);
    const response = await fetch("/api/spaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    setSubmitting(false);
    if (response.ok) {
      setNewName("");
      setCreating(false);
      load();
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl italic tracking-tight">Spaces</h1>
          <p className="mt-1 text-sm text-muted">
            Organize your documents into folders, each with its own dashboard and quiz.
          </p>
        </div>
        <Button icon={<PlusIcon />} className="w-auto px-6" onClick={() => setCreating((value) => !value)}>
          New Space
        </Button>
      </div>

      {creating && (
        <Card className="flex items-center gap-3">
          <input
            autoFocus
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && handleCreate()}
            placeholder="Space name"
            className="flex-1 rounded-xl border border-border bg-background p-3 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <Button className="w-auto px-6" loading={submitting} disabled={!newName.trim()} onClick={handleCreate}>
            Create
          </Button>
        </Card>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <Card key={index}>
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="mt-3 h-3 w-1/3" />
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {spaces.map((space) => (
            <Link key={space.id} href={`/spaces/${space.id}`}>
              <Card className="flex h-full flex-col gap-3 transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg">
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
                  <p className="font-display text-lg italic leading-tight">{space.name}</p>
                  <p className="mt-1 text-xs text-muted">
                    {space.documentCount} {space.documentCount === 1 ? "document" : "documents"}
                  </p>
                </div>
                <div className="flex items-center gap-1 text-xs text-accent">
                  Open space <ArrowRightIcon />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
