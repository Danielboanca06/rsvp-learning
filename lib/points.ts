import { prisma } from "@/lib/prisma";

export const POINTS = {
  chunk_passed: 10,
  review_passed: 5,
  word_recalled: 15,
  quiz_correct: 4,
} as const;

export type PointsReason = keyof typeof POINTS;

export function pointsEventData(userId: string, reason: PointsReason) {
  return { userId, amount: POINTS[reason], reason };
}

export async function getTotalPoints(userId: string): Promise<number> {
  const result = await prisma.pointsEvent.aggregate({ where: { userId }, _sum: { amount: true } });
  return result._sum.amount ?? 0;
}
