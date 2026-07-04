"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Card } from "@/components/ui/Card";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";
import { PlayIcon, UploadIcon, FileTextIcon } from "@/components/ui/icons";

type Mode = "upload" | "paste";

export default function NewDocumentPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const canSubmit = mode === "upload" ? file !== null : text.trim().length > 0;

  async function handleSubmit() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);

    const formData = new FormData();
    if (title.trim()) formData.set("title", title.trim());
    if (mode === "upload" && file) {
      formData.set("file", file);
    } else {
      formData.set("text", text);
    }

    try {
      const response = await fetch("/api/documents", { method: "POST", body: formData });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "Could not process this document.");
      }
      const { document } = await response.json();
      router.push(`/documents/${document.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSubmitting(false);
    }
  }

  if (submitting) {
    return <AnalyzingSkeleton />;
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New Document</h1>
        <p className="mt-1 text-sm text-muted">
          Upload a text file or PDF, or paste text directly. We&apos;ll break it into a semantic Learning Path.
        </p>
      </div>

      <Card className="flex flex-col gap-6">
        <div className="inline-flex w-fit rounded-xl border border-border bg-background p-1">
          <button
            onClick={() => setMode("upload")}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
              mode === "upload" ? "bg-accent text-white" : "text-muted hover:text-foreground"
            )}
          >
            Upload File
          </button>
          <button
            onClick={() => setMode("paste")}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
              mode === "paste" ? "bg-accent text-white" : "text-muted hover:text-foreground"
            )}
          >
            Paste Text
          </button>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-muted">Title (optional)</label>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Give this document a name"
            className="w-full rounded-xl border border-border bg-surface p-3 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>

        <AnimatePresence mode="wait">
          {mode === "upload" ? (
            <motion.div
              key="upload"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragActive(false);
                  const dropped = event.dataTransfer.files?.[0];
                  if (dropped) setFile(dropped);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-12 text-center transition-colors",
                  dragActive ? "border-accent bg-accent-soft" : "border-border hover:border-accent/50"
                )}
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent">
                  {file ? <FileTextIcon /> : <UploadIcon />}
                </span>
                {file ? (
                  <p className="text-sm font-medium">{file.name}</p>
                ) : (
                  <>
                    <p className="text-sm font-medium">Drop a .txt or .pdf file here</p>
                    <p className="text-xs text-muted">or click to browse</p>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.pdf,text/plain,application/pdf"
                  className="hidden"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="paste"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <Textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Paste your text here..."
                className="h-64"
              />
            </motion.div>
          )}
        </AnimatePresence>

        {error && (
          <p className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>
        )}

        <Button icon={<PlayIcon />} disabled={!canSubmit} onClick={handleSubmit}>
          Build Learning Path
        </Button>
      </Card>
    </div>
  );
}

function AnalyzingSkeleton() {
  return (
    <div className="flex flex-col items-center gap-8 py-16 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft text-accent">
        <motion.span
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1.4, ease: "linear" }}
        >
          <UploadIcon />
        </motion.span>
      </span>
      <div>
        <p className="text-lg font-medium">Analyzing your document...</p>
        <p className="mt-1 text-sm text-muted">
          Reading the text and grouping it into semantically coherent modules.
        </p>
      </div>
      <div className="flex w-full max-w-md flex-col gap-3">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-14 w-full" />
        ))}
      </div>
    </div>
  );
}
