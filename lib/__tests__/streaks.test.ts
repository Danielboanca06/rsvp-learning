import { describe, expect, it } from "vitest";
import { computeStreaksFromDates } from "@/lib/streaks";

const NOW = new Date("2026-07-10T15:00:00.000Z");

function daysAgo(days: number, hour = 9): Date {
  const date = new Date(NOW);
  date.setUTCDate(date.getUTCDate() - days);
  date.setUTCHours(hour, 0, 0, 0);
  return date;
}

describe("computeStreaksFromDates", () => {
  it("returns zeros with no activity", () => {
    expect(computeStreaksFromDates([], NOW)).toEqual({ current: 0, longest: 0, activeToday: false });
  });

  it("counts consecutive days ending today", () => {
    const result = computeStreaksFromDates([daysAgo(0), daysAgo(1), daysAgo(2)], NOW);
    expect(result).toEqual({ current: 3, longest: 3, activeToday: true });
  });

  it("keeps yesterday's streak alive when today has no activity yet", () => {
    const result = computeStreaksFromDates([daysAgo(1), daysAgo(2)], NOW);
    expect(result).toEqual({ current: 2, longest: 2, activeToday: false });
  });

  it("breaks the current streak after a full missed day", () => {
    const result = computeStreaksFromDates([daysAgo(2), daysAgo(3)], NOW);
    expect(result.current).toBe(0);
    expect(result.longest).toBe(2);
  });

  it("collapses multiple same-day events into one streak day", () => {
    const result = computeStreaksFromDates([daysAgo(0, 1), daysAgo(0, 12), daysAgo(0, 23)], NOW);
    expect(result).toEqual({ current: 1, longest: 1, activeToday: true });
  });

  it("tracks the longest historical run independently of the current one", () => {
    const longRun = [daysAgo(10), daysAgo(11), daysAgo(12), daysAgo(13), daysAgo(14)];
    const result = computeStreaksFromDates([daysAgo(0), ...longRun], NOW);
    expect(result.current).toBe(1);
    expect(result.longest).toBe(5);
  });
});
