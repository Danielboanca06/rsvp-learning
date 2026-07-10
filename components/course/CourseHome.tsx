"use client";

// Course home: progress, module list with per-state actions, and the
// completion check. Mastery is earned inside the ordinary document read/quiz
// flow, so on load (and on window focus, i.e. returning from the reader) this
// component asks the server whether the current module's mastery gate now
// passes — a 409 just means "keep studying", success plays the unlock
// animation on the next module.

import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Skeleton } from "@/components/ui/Skeleton";
import { ModuleCard, type CourseModuleView } from "@/components/course/ModuleCard";

type CourseView = {
  id: string;
  title: string;
  goal: string;
  status: string;
  progressPct: number;
  modules: CourseModuleView[];
};

const GENERATING_POLL_MS = 3000;

export function CourseHome({ courseId }: { courseId: string }) {
  const [course, setCourse] = useState<CourseView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [justUnlockedOrder, setJustUnlockedOrder] = useState<number | null>(null);
  const completionAttempted = useRef<Set<number>>(new Set());

  const refetch = useCallback(async (): Promise<CourseView | null> => {
    const response = await fetch(`/api/courses/${courseId}`);
    if (!response.ok) {
      setError("Could not load this course.");
      return null;
    }
    const body = (await response.json()) as { course: CourseView };
    setCourse(body.course);
    return body.course;
  }, [courseId]);

  const checkCompletion = useCallback(
    async (current: CourseView | null) => {
      const readyModule = current?.modules.find((module) => module.status === "ready");
      if (!readyModule) return;
      // One attempt per module per visit — the gate is re-checked on focus, so
      // don't hammer the endpoint from polling renders.
      if (completionAttempted.current.has(readyModule.order)) return;
      completionAttempted.current.add(readyModule.order);

      const response = await fetch(`/api/courses/${courseId}/modules/${readyModule.order}/complete`, {
        method: "POST",
      });
      if (response.ok) {
        const result = (await response.json()) as { unlockedOrder: number | null };
        if (result.unlockedOrder !== null) setJustUnlockedOrder(result.unlockedOrder);
        await refetch();
      }
      // 409 = not mastered yet; expected while studying, nothing to show.
    },
    [courseId, refetch]
  );

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const loaded = await refetch();
      if (!cancelled) await checkCompletion(loaded);
    };
    // Deferred so the effect body itself stays synchronous-state-free.
    const initial = setTimeout(() => void load(), 0);

    const onFocus = () => {
      completionAttempted.current.clear();
      void load();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      clearTimeout(initial);
      window.removeEventListener("focus", onFocus);
    };
  }, [refetch, checkCompletion]);

  // Poll while any module is generating (generation runs inside the request,
  // but another tab/device or a lost response may leave us watching).
  const anyGenerating = course?.modules.some((module) => module.status === "generating") ?? false;
  useEffect(() => {
    if (!anyGenerating) return;
    const interval = setInterval(refetch, GENERATING_POLL_MS);
    return () => clearInterval(interval);
  }, [anyGenerating, refetch]);

  async function handleGenerate(order: number) {
    if (!course) return;
    // Optimistic: show the spinner immediately; the request itself returns
    // when generation is done (or failed).
    setCourse({
      ...course,
      modules: course.modules.map((module) =>
        module.order === order ? { ...module, status: "generating" } : module
      ),
    });
    setError(null);

    const response = await fetch(`/api/courses/${courseId}/modules/${order}/generate`, { method: "POST" });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Module generation failed. Please retry.");
    }
    await refetch();
  }

  if (error && !course) {
    return <p className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>;
  }
  if (!course) {
    return <CourseHomeSkeleton />;
  }

  const nextActionable = course.modules.find((module) =>
    ["unlocked", "ready", "generating", "failed"].includes(module.status)
  );

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-3xl italic tracking-tight">{course.title}</h1>
        <p className="mt-1 text-sm text-muted">{course.goal}</p>
      </div>

      <Card className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">
            {course.status === "completed"
              ? "Course completed — brilliant work."
              : nextActionable
                ? `Up next: ${nextActionable.title}`
                : "Course progress"}
          </span>
          <span className="font-medium">{course.progressPct}%</span>
        </div>
        <ProgressBar value={course.progressPct} />
      </Card>

      {error && <p className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>}

      <ol className="flex flex-col gap-3">
        {course.modules.map((module) => (
          <ModuleCard
            key={module.id}
            module={module}
            justUnlocked={justUnlockedOrder === module.order}
            onGenerate={handleGenerate}
          />
        ))}
      </ol>
    </div>
  );
}

function CourseHomeSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="mt-2 h-4 w-1/2" />
      </div>
      <Skeleton className="h-16 w-full rounded-2xl" />
      <div className="flex flex-col gap-3">
        {[0, 1, 2, 3, 4].map((index) => (
          <Skeleton key={index} className="h-24 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
