"use client";

// Dashboard rail for AI courses, mirroring the documents carousel: in-progress
// courses first, plus a "Create a course" entry card.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Skeleton } from "@/components/ui/Skeleton";
import { GraduationCapIcon, PlusIcon } from "@/components/ui/icons";

type CourseSummary = {
  id: string;
  title: string;
  goal: string;
  status: string;
  moduleCount: number;
  progressPct: number;
};

export function CoursesRail() {
  const [courses, setCourses] = useState<CourseSummary[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/courses")
      .then((response) => response.json())
      .then((body: { courses: CourseSummary[] }) => {
        if (!cancelled) setCourses(body.courses ?? []);
      })
      .catch(() => {
        if (!cancelled) setCourses([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <h2 className="mb-4 font-display text-xl italic tracking-tight">Courses</h2>
      {courses === null ? (
        <div className="flex gap-4 overflow-x-auto pb-2">
          <Skeleton className="h-36 w-[260px] shrink-0 rounded-2xl" />
          <Skeleton className="h-36 w-[260px] shrink-0 rounded-2xl" />
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {courses.map((course) => (
            <Link key={course.id} href={`/courses/${course.id}`} className="w-[260px] shrink-0">
              <Card className="flex h-full flex-col gap-3 transition-shadow duration-200 hover:shadow-lg">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                    <GraduationCapIcon />
                  </span>
                  <p className="line-clamp-2 font-medium leading-tight">{course.title}</p>
                </div>
                <div className="mt-auto">
                  <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
                    <span>
                      {course.moduleCount} modules{course.status === "draft" ? " · draft" : ""}
                    </span>
                    <span>{course.progressPct}%</span>
                  </div>
                  <ProgressBar value={course.progressPct} />
                </div>
              </Card>
            </Link>
          ))}
          <Link href="/courses/new" className="w-[260px] shrink-0">
            <Card className="flex h-full min-h-36 flex-col items-center justify-center gap-2 border-dashed text-center transition-colors hover:border-accent/50">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-soft text-accent">
                <PlusIcon />
              </span>
              <p className="text-sm font-medium">Create a course</p>
              <p className="px-4 text-xs text-muted">Tell the AI a goal — get a personal syllabus.</p>
            </Card>
          </Link>
        </div>
      )}
    </div>
  );
}
