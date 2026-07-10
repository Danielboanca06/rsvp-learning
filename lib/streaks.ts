// Study streaks, derived from existing activity timestamps — no new writes,
// no cron. A streak day is any UTC day with at least one graded summary
// (Attempt), answered quiz question (QuizItem), or points-earning action
// (PointsEvent, which also covers vocabulary recall).
import { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";

// Longest-streak scan window. Bounded so the queries stay cheap; a >1 year
// unbroken streak will read as 365 until we care enough to denormalize.
const STREAK_WINDOW_DAYS = 365;

export type StreakSummary = {
  current: number;
  longest: number;
  activeToday: boolean;
};

function utcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function computeStreaksFromDates(activityDates: Iterable<Date>, now = new Date()): StreakSummary {
  const days = new Set<string>();
  for (const date of activityDates) days.add(utcDayKey(date));

  const dayMs = 24 * 60 * 60 * 1000;
  const todayKey = utcDayKey(now);
  const activeToday = days.has(todayKey);

  // Current streak counts backward from today (or yesterday — a streak isn't
  // broken until a full day passes with no activity).
  let current = 0;
  let cursor = activeToday ? now.getTime() : now.getTime() - dayMs;
  while (days.has(utcDayKey(new Date(cursor)))) {
    current += 1;
    cursor -= dayMs;
  }

  let longest = 0;
  let run = 0;
  for (let offset = STREAK_WINDOW_DAYS; offset >= 0; offset -= 1) {
    if (days.has(utcDayKey(new Date(now.getTime() - offset * dayMs)))) {
      run += 1;
      if (run > longest) longest = run;
    } else {
      run = 0;
    }
  }

  return { current, longest: Math.max(longest, current), activeToday };
}

export async function getStreaks(userId: string, db: PrismaClient = defaultPrisma): Promise<StreakSummary> {
  const since = new Date(Date.now() - STREAK_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [attempts, quizAnswers, pointsEvents] = await Promise.all([
    db.attempt.findMany({
      where: { session: { userId }, createdAt: { gte: since } },
      select: { createdAt: true },
    }),
    db.quizItem.findMany({
      where: { quiz: { userId }, answeredAt: { not: null, gte: since } },
      select: { answeredAt: true },
    }),
    db.pointsEvent.findMany({
      where: { userId, createdAt: { gte: since } },
      select: { createdAt: true },
    }),
  ]);

  return computeStreaksFromDates([
    ...attempts.map((attempt) => attempt.createdAt),
    ...quizAnswers.map((item) => item.answeredAt!),
    ...pointsEvents.map((event) => event.createdAt),
  ]);
}
