"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Skeleton } from "@/components/ui/Skeleton";
import { ArrowRightIcon, GraduationCapIcon, PlusIcon } from "@/components/ui/icons";

type CourseSummary = {
  id: string;
  title: string;
  goal: string;
  status: string;
  moduleCount: number;
  progressPct: number;
};

export default function CoursesPage() {
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
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl italic tracking-tight">Courses</h1>
          <p className="mt-1 text-sm text-muted">AI-built learning paths toward your goals, one module at a time.</p>
        </div>
        <Link href="/courses/new" className="w-auto">
          <Button icon={<PlusIcon />} className="w-auto px-6">
            New Course
          </Button>
        </Link>
      </div>

      {courses === null ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {[0, 1].map((index) => (
            <Skeleton key={index} className="h-40 w-full rounded-2xl" />
          ))}
        </div>
      ) : courses.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent">
            <GraduationCapIcon />
          </span>
          <p className="font-medium">No courses yet</p>
          <p className="max-w-sm text-sm text-muted">
            Tell the AI what you want to learn and it designs a personal syllabus, then writes each module as you
            progress.
          </p>
          <Link href="/courses/new" className="mt-2 w-auto">
            <Button icon={<PlusIcon />} className="w-auto px-6">
              Create a course
            </Button>
          </Link>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {courses.map((course) => (
            <CourseCard key={course.id} course={course} />
          ))}
        </div>
      )}
    </div>
  );
}

function CourseCard({ course }: { course: CourseSummary }) {
  const completed = course.status === "completed";
  return (
    <Card className="flex h-full flex-col gap-4 transition-shadow duration-200 hover:shadow-lg">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <GraduationCapIcon />
        </span>
        <div className="min-w-0">
          <p className="font-medium leading-tight">{course.title}</p>
          <p className="mt-1 line-clamp-2 text-xs text-muted">{course.goal}</p>
        </div>
      </div>
      <div>
        <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
          <span>
            {course.moduleCount} modules{course.status === "draft" ? " · draft" : ""}
          </span>
          <span>{course.progressPct}%</span>
        </div>
        <ProgressBar value={course.progressPct} />
      </div>
      <Link href={`/courses/${course.id}`} className="mt-auto w-auto">
        <Button variant="secondary" icon={<ArrowRightIcon />} className="w-auto px-6">
          {completed ? "Review" : "Continue"}
        </Button>
      </Link>
    </Card>
  );
}
