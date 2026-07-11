"use client";

// 3-step course creation wizard: (1) goal, (2) learner brief, (3) syllabus
// review. The syllabus step is editable (rename / reorder / delete modules)
// while the course is still a draft; "Start course" activates it.

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  GraduationCapIcon,
  PlayIcon,
  RefreshIcon,
  SparklesIcon,
  TrashIcon,
  XIcon,
} from "@/components/ui/icons";

type Level = "beginner" | "intermediate" | "advanced";

type DraftModule = {
  id: string;
  order: number;
  title: string;
  summary: string;
  objectives: string[];
  status: string;
};

type DraftCourse = {
  id: string;
  title: string;
  goal: string;
  modules: DraftModule[];
};

const LEVELS: Array<{ value: Level; label: string; hint: string }> = [
  { value: "beginner", label: "Beginner", hint: "Starting from scratch" },
  { value: "intermediate", label: "Intermediate", hint: "I know the basics" },
  { value: "advanced", label: "Advanced", hint: "Deepening expertise" },
];

const TIME_BUDGETS: Array<{ value: number; label: string }> = [
  { value: 10, label: "~10 min / day" },
  { value: 20, label: "~20 min / day" },
  { value: 40, label: "~40 min / day" },
  { value: 60, label: "1 hour+ / day" },
];

export function CourseWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);

  const [goal, setGoal] = useState("");
  const [level, setLevel] = useState<Level>("beginner");
  const [timeBudget, setTimeBudget] = useState(20);
  const [motivation, setMotivation] = useState("");
  const [interests, setInterests] = useState("");

  const [generating, setGenerating] = useState(false);
  const [starting, setStarting] = useState(false);
  const [course, setCourse] = useState<DraftCourse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [proBlocked, setProBlocked] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);

  async function generateSyllabus() {
    setGenerating(true);
    setError(null);
    setProBlocked(false);
    setConfirmRegenerate(false);

    try {
      // Regenerating abandons the previous draft (it stays archived, its
      // credits are already spent — hence the confirm step before this).
      if (course) {
        await fetch(`/api/courses/${course.id}`, { method: "DELETE" });
        setCourse(null);
      }
      const response = await fetch("/api/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal,
          brief: {
            level,
            timeBudgetMinutesPerDay: timeBudget,
            motivation,
            ...(interests.trim() ? { interests } : {}),
          },
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (body.reason === "pro_feature") setProBlocked(true);
        throw new Error(body.error ?? "Could not generate the syllabus.");
      }
      setCourse(body.course);
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setGenerating(false);
    }
  }

  async function startCourse() {
    if (!course) return;
    setStarting(true);
    setError(null);
    try {
      const response = await fetch(`/api/courses/${course.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "active",
          modules: course.modules.map((module) => ({ id: module.id, title: module.title })),
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "Could not start the course.");
      }
      router.push(`/courses/${course.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStarting(false);
    }
  }

  function moveModule(index: number, delta: -1 | 1) {
    if (!course) return;
    const next = [...course.modules];
    const swap = index + delta;
    if (swap < 0 || swap >= next.length) return;
    [next[index], next[swap]] = [next[swap], next[index]];
    setCourse({ ...course, modules: next });
  }

  function renameModule(index: number, title: string) {
    if (!course) return;
    setCourse({
      ...course,
      modules: course.modules.map((module, i) => (i === index ? { ...module, title } : module)),
    });
  }

  function deleteModule(index: number) {
    if (!course || course.modules.length <= 1) return;
    setCourse({ ...course, modules: course.modules.filter((_, i) => i !== index) });
  }

  if (generating) {
    return <GeneratingSyllabus goal={goal} />;
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-3xl italic tracking-tight">New Course</h1>
        <p className="mt-1 text-sm text-muted">
          Tell the AI what you want to learn — it designs a personal syllabus and writes each module as you go.
        </p>
      </div>

      <StepDots step={step} />

      {error && (
        <div className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
          <p>{error}</p>
          {proBlocked && (
            <Link href="/billing" className="mt-2 inline-block font-medium underline">
              See plans &amp; start your free trial →
            </Link>
          )}
        </div>
      )}

      <AnimatePresence mode="wait">
        {step === 0 && (
          <WizardStep key="goal">
            <Card className="flex flex-col gap-5">
              <div>
                <h2 className="font-display text-xl italic">What do you want to learn?</h2>
                <p className="mt-1 text-sm text-muted">Be specific — a clear goal makes a better course.</p>
              </div>
              <Textarea
                value={goal}
                autoFocus
                onChange={(event) => setGoal(event.target.value)}
                placeholder='e.g. "SQL well enough to analyze my startup&apos;s data" or "the fundamentals of music theory"'
                className="h-28"
                maxLength={2000}
              />
              <p className="-mt-3 text-right text-xs text-muted">{goal.length}/2000</p>
              <Button disabled={goal.trim().length < 3} onClick={() => setStep(1)}>
                Continue
              </Button>
            </Card>
          </WizardStep>
        )}

        {step === 1 && (
          <WizardStep key="brief">
            <Card className="flex flex-col gap-6">
              <div>
                <h2 className="font-display text-xl italic">About you</h2>
                <p className="mt-1 text-sm text-muted">The course adapts to your level, time, and motivation.</p>
              </div>

              <fieldset>
                <legend className="mb-2 block text-sm font-medium text-muted">Where are you starting from?</legend>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {LEVELS.map((option) => (
                    <RadioCard
                      key={option.value}
                      selected={level === option.value}
                      onSelect={() => setLevel(option.value)}
                      label={option.label}
                      hint={option.hint}
                    />
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className="mb-2 block text-sm font-medium text-muted">How much time can you give it?</legend>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {TIME_BUDGETS.map((option) => (
                    <RadioCard
                      key={option.value}
                      selected={timeBudget === option.value}
                      onSelect={() => setTimeBudget(option.value)}
                      label={option.label}
                    />
                  ))}
                </div>
              </fieldset>

              <div>
                <label className="mb-2 block text-sm font-medium text-muted">Why do you want to learn this?</label>
                <Textarea
                  value={motivation}
                  onChange={(event) => setMotivation(event.target.value)}
                  placeholder="e.g. switching careers, a project at work, pure curiosity..."
                  className="h-20"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-muted">
                  Interests to draw examples from <span className="font-normal">(optional)</span>
                </label>
                <input
                  value={interests}
                  onChange={(event) => setInterests(event.target.value)}
                  placeholder="e.g. football, cooking, sci-fi"
                  className="w-full rounded-xl border border-border bg-surface p-3 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>

              <div className="flex gap-3">
                <Button variant="ghost" className="w-auto px-6" onClick={() => setStep(0)}>
                  Back
                </Button>
                <Button
                  icon={<SparklesIcon />}
                  disabled={motivation.trim().length === 0}
                  onClick={generateSyllabus}
                  className="flex-1"
                >
                  Generate my syllabus
                </Button>
              </div>
            </Card>
          </WizardStep>
        )}

        {step === 2 && course && (
          <WizardStep key="review">
            <Card className="flex flex-col gap-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-display text-2xl italic">{course.title}</h2>
                  <p className="mt-1 text-sm text-muted">
                    {course.modules.length} modules · rename, reorder or remove them before you start.
                  </p>
                </div>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                  <GraduationCapIcon />
                </span>
              </div>

              <ol className="flex flex-col gap-2">
                {course.modules.map((module, index) => (
                  <li key={module.id} className="flex items-start gap-2 rounded-xl border border-border bg-surface p-3">
                    <span className="mt-2 w-6 shrink-0 text-center text-sm font-semibold text-muted">{index + 1}</span>
                    <div className="min-w-0 flex-1">
                      <input
                        value={module.title}
                        onChange={(event) => renameModule(index, event.target.value)}
                        className="w-full rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-sm font-medium text-foreground focus:border-accent focus:outline-none"
                        aria-label={`Module ${index + 1} title`}
                      />
                      <p className="px-2 pt-0.5 text-xs text-muted">{module.summary}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <IconButton label="Move up" disabled={index === 0} onClick={() => moveModule(index, -1)}>
                        <ChevronUpIcon />
                      </IconButton>
                      <IconButton
                        label="Move down"
                        disabled={index === course.modules.length - 1}
                        onClick={() => moveModule(index, 1)}
                      >
                        <ChevronDownIcon />
                      </IconButton>
                      <IconButton
                        label="Remove module"
                        disabled={course.modules.length <= 1}
                        onClick={() => deleteModule(index)}
                      >
                        <TrashIcon />
                      </IconButton>
                    </div>
                  </li>
                ))}
              </ol>

              {confirmRegenerate ? (
                <div className="flex flex-col gap-3 rounded-xl border border-border bg-background p-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted">Regenerating designs a fresh syllabus and costs credits again.</p>
                  <div className="flex gap-2">
                    <Button variant="secondary" icon={<RefreshIcon />} className="w-auto px-4" onClick={generateSyllabus}>
                      Yes, regenerate
                    </Button>
                    <Button variant="ghost" icon={<XIcon />} className="w-auto px-4" onClick={() => setConfirmRegenerate(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button variant="ghost" icon={<RefreshIcon />} className="w-auto px-6" onClick={() => setConfirmRegenerate(true)}>
                    Regenerate
                  </Button>
                  <Button icon={<PlayIcon />} loading={starting} onClick={startCourse} className="flex-1">
                    Start course
                  </Button>
                </div>
              )}
            </Card>
          </WizardStep>
        )}
      </AnimatePresence>
    </div>
  );
}

function WizardStep({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.18 }}
    >
      {children}
    </motion.div>
  );
}

function StepDots({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-2" aria-label={`Step ${step + 1} of 3`}>
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className={cn(
            "h-1.5 rounded-full transition-all duration-300",
            index === step ? "w-8 bg-accent" : "w-4 bg-border",
            index < step && "bg-accent/40"
          )}
        />
      ))}
    </div>
  );
}

function RadioCard({
  selected,
  onSelect,
  label,
  hint,
}: {
  selected: boolean;
  onSelect: () => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "rounded-xl border p-3 text-left transition-colors",
        selected ? "border-accent bg-accent-soft" : "border-border bg-surface hover:border-accent/40"
      )}
    >
      <p className={cn("text-sm font-medium", selected ? "text-accent" : "text-foreground")}>{label}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </button>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-hover hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function GeneratingSyllabus({ goal }: { goal: string }) {
  return (
    <div className="flex flex-col items-center gap-8 py-16 text-center">
      <motion.span
        animate={{ scale: [1, 1.08, 1] }}
        transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft text-accent"
      >
        <SparklesIcon />
      </motion.span>
      <div>
        <p className="font-display text-xl italic">Designing your course...</p>
        <p className="mt-1 max-w-md text-sm text-muted">
          Building a module-by-module path toward &ldquo;{goal.trim()}&rdquo;. This takes up to a minute.
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
