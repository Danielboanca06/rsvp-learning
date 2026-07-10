"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { PlayIcon, CheckIcon, HistoryIcon, TrashIcon, LayersIcon, MessageCircleIcon, BrainIcon } from "@/components/ui/icons";
import { ThreadDrawer } from "@/components/chat/ThreadDrawer";
import { cn } from "@/lib/cn";

type Chunk = {
  id: string;
  order: number;
  title: string;
  wordCount: number;
  sectionTitle: string | null;
};

type DocumentDetail = {
  id: string;
  title: string;
  createdAt: string;
  chunks: Chunk[];
};

type DocumentResponse = {
  document: DocumentDetail;
  masteredChunkIds: string[];
  activeSession: { id: string } | null;
};

type ThreadSummary = {
  id: string;
  kind: string;
  title: string;
  chunkId: string | null;
  parentThreadId: string | null;
  _count: { messages: number };
};

export default function DocumentOverviewPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<DocumentResponse | null>(null);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/documents/${params.id}`)
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    fetch(`/api/chat/threads?documentId=${params.id}`)
      .then((res) => (res.ok ? res.json() : { threads: [] }))
      .then((json) => {
        if (!cancelled) setThreads(json.threads ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  async function handleStart() {
    if (!data) return;

    if (data.activeSession) {
      router.push(`/documents/${data.document.id}/read?session=${data.activeSession.id}`);
      return;
    }

    setStarting(true);
    setNotice(null);

    const response = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId: data.document.id }),
    });
    const json = await response.json();

    if (!response.ok) {
      setNotice(json.error ?? "Could not start a session.");
      setStarting(false);
      return;
    }

    if (json.documentComplete) {
      setNotice("You've already mastered every module in this document.");
      setStarting(false);
      return;
    }

    router.push(`/documents/${data.document.id}/read?session=${json.session.id}`);
  }

  async function handleDelete() {
    if (!data) return;
    await fetch(`/api/documents/${data.document.id}`, { method: "DELETE" });
    router.push("/");
  }

  if (loading || !data) {
    return <OverviewSkeleton />;
  }

  const { document, masteredChunkIds } = data;
  const masteredSet = new Set(masteredChunkIds);
  const totalChunks = document.chunks.length;
  const masteryPct = totalChunks === 0 ? 0 : Math.round((masteredSet.size / totalChunks) * 100);
  const currentChunk = document.chunks.find((chunk) => !masteredSet.has(chunk.id));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl italic tracking-tight">{document.title}</h1>
          <p className="mt-1 text-sm text-muted">
            {totalChunks} modules · created {new Date(document.createdAt).toLocaleDateString()}
          </p>
        </div>
        <button
          onClick={handleDelete}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:border-danger/40 hover:text-danger"
          aria-label="Delete document"
        >
          <TrashIcon />
        </button>
      </div>

      <Card className="flex flex-col gap-5">
        <div>
          <div className="mb-1.5 flex items-center justify-between text-sm">
            <span className="text-muted">Mastery</span>
            <span className="font-medium">{masteryPct}%</span>
          </div>
          <ProgressBar value={masteryPct} />
        </div>

        {notice && <p className="rounded-lg bg-accent-soft px-4 py-3 text-sm text-accent">{notice}</p>}

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button icon={<PlayIcon />} loading={starting} onClick={handleStart} className="sm:w-auto sm:px-8">
            {data.activeSession ? "Resume Session" : masteryPct === 100 ? "Practice Again" : "Start Session"}
          </Button>
          <Link href={`/documents/${document.id}/history`} className="w-full sm:w-auto">
            <Button variant="secondary" icon={<HistoryIcon />} className="sm:w-auto sm:px-8">
              View History
            </Button>
          </Link>
          <Link href={`/documents/${document.id}/summary`} className="w-full sm:w-auto">
            <Button variant="secondary" icon={<LayersIcon />} className="sm:w-auto sm:px-8">
              View Summaries
            </Button>
          </Link>
        </div>
      </Card>

      <div>
        <h2 className="mb-4 font-display text-xl italic tracking-tight">Learning Path</h2>
        <div className="flex flex-col gap-2">
          {document.chunks.map((chunk, index) => {
            const mastered = masteredSet.has(chunk.id);
            const isCurrent = currentChunk?.id === chunk.id;
            const chunkThreads = threads.filter((thread) => thread.chunkId === chunk.id);
            const topLevelThreads = chunkThreads.filter((thread) => !thread.parentThreadId);
            // Sub-modules are grouped under their parent section: show a header
            // whenever the section changes as the path is walked in order.
            const previousSection = index > 0 ? document.chunks[index - 1].sectionTitle : null;
            const startsNewSection = chunk.sectionTitle !== null && chunk.sectionTitle !== previousSection;
            return (
              <div key={chunk.id} className="flex flex-col gap-1.5">
                {startsNewSection && (
                  <p className={cn("text-xs font-medium uppercase tracking-wide text-muted", index > 0 && "mt-3")}>
                    {chunk.sectionTitle}
                  </p>
                )}
                <div
                  className={cn(
                    "flex items-center gap-4 rounded-xl border p-4 transition-colors",
                    isCurrent ? "border-accent bg-accent-soft" : "border-border bg-surface"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium",
                      mastered
                        ? "bg-success-soft text-success"
                        : isCurrent
                          ? "bg-accent text-accent-foreground"
                          : "bg-border/60 text-muted"
                    )}
                  >
                    {mastered ? <CheckIcon /> : chunk.order + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium leading-tight">{chunk.title}</p>
                    <p className="mt-0.5 text-xs text-muted">{chunk.wordCount} words</p>
                  </div>
                  {mastered ? (
                    <span className="text-xs font-medium text-success">Mastered</span>
                  ) : isCurrent ? (
                    <span className="text-xs font-medium text-accent">Up next</span>
                  ) : (
                    <span className="text-xs text-muted">Locked</span>
                  )}
                </div>

                {/* AI discussions anchored to this module, with practice
                    exercises nested under their parent. Everything is
                    min-w-0-constrained: long thread titles must truncate,
                    never widen the page (the old layout pushed the whole
                    page off-center on mobile). */}
                {topLevelThreads.length > 0 && (
                  <div className="ml-3 flex min-w-0 flex-col gap-0.5 border-l-2 border-border/60 pl-2 sm:ml-6 sm:pl-3">
                    {topLevelThreads.map((thread) => {
                      const childThreads = chunkThreads.filter((child) => child.parentThreadId === thread.id);
                      return (
                        <div key={thread.id} className="flex min-w-0 flex-col gap-0.5">
                          <ThreadRow thread={thread} onOpen={() => setOpenThreadId(thread.id)} />
                          {childThreads.map((child) => (
                            <ThreadRow key={child.id} thread={child} onOpen={() => setOpenThreadId(child.id)} nested />
                          ))}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <ThreadDrawer threadId={openThreadId} onClose={() => setOpenThreadId(null)} />
    </div>
  );
}

function ThreadRow({ thread, onOpen, nested = false }: { thread: ThreadSummary; onOpen: () => void; nested?: boolean }) {
  const isPractice = thread.kind === "practice";
  return (
    <button
      onClick={onOpen}
      className={cn(
        "flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-muted transition-colors hover:bg-surface hover:text-foreground",
        nested && "pl-7"
      )}
    >
      <span className={cn("inline-flex shrink-0 [&>svg]:h-3.5 [&>svg]:w-3.5", isPractice ? "text-accent" : "")}>
        {isPractice ? <BrainIcon /> : <MessageCircleIcon />}
      </span>
      <span className="min-w-0 flex-1 truncate">{thread.title}</span>
      <span className="shrink-0 text-[0.6875rem] tabular-nums text-muted/70">
        {thread._count.messages} {thread._count.messages === 1 ? "message" : "messages"}
      </span>
    </button>
  );
}

function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <Skeleton className="h-7 w-64" />
        <Skeleton className="mt-2 h-3 w-40" />
      </div>
      <Card className="flex flex-col gap-5">
        <Skeleton className="h-2 w-full rounded-full" />
        <div className="flex gap-3">
          <Skeleton className="h-12 w-40 rounded-xl" />
          <Skeleton className="h-12 w-40 rounded-xl" />
        </div>
      </Card>
      <div className="flex flex-col gap-2">
        {[0, 1, 2, 3, 4].map((index) => (
          <Skeleton key={index} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
