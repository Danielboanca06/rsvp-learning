import { prisma } from "@/lib/prisma";
import { generateQuizQuestionGated } from "@/lib/llm-quota";

export const MODULE_QUIZ_FLOOR_N = 3;
export const MODULE_QUIZ_RANDOM_P = 0.25;

const DAILY_QUIZ_WEAK_SLOTS = 3;
const DAILY_QUIZ_RECENT_SLOTS = 2;
const DAILY_QUIZ_TOTAL = DAILY_QUIZ_WEAK_SLOTS + DAILY_QUIZ_RECENT_SLOTS;
const RECENT_WINDOW_HOURS = 24;

export function shouldTriggerModuleQuiz(order: number): boolean {
  if ((order + 1) % MODULE_QUIZ_FLOOR_N === 0) return true;
  return Math.random() < MODULE_QUIZ_RANDOM_P;
}

async function getFailCounts(userId: string): Promise<Map<string, number>> {
  const grouped = await prisma.attempt.groupBy({
    by: ["chunkId"],
    where: { passed: false, session: { userId } },
    _count: { _all: true },
  });
  return new Map(grouped.map((row) => [row.chunkId, row._count._all]));
}

export async function getWeakChunks(
  userId: string,
  limit: number,
  excludeIds: string[] = [],
  documentIds?: string[]
): Promise<{ id: string; weaknessScore: number }[]> {
  const [failCounts, chunks] = await Promise.all([
    getFailCounts(userId),
    prisma.chunk.findMany({
      where: {
        document: { userId },
        ...(excludeIds.length > 0 ? { id: { notIn: excludeIds } } : {}),
        ...(documentIds ? { documentId: { in: documentIds } } : {}),
      },
      select: { id: true, lapses: true, difficulty: true, quizWrongCount: true, lastReviewedAt: true },
    }),
  ]);

  const scored = chunks
    .map((chunk) => ({
      id: chunk.id,
      weaknessScore:
        (failCounts.get(chunk.id) ?? 0) * 3 + chunk.quizWrongCount * 3 + chunk.lapses * 2 + (chunk.difficulty ?? 0),
      lastReviewedAt: chunk.lastReviewedAt,
    }))
    .filter((chunk) => chunk.weaknessScore > 0)
    .sort((a, b) => {
      if (b.weaknessScore !== a.weaknessScore) return b.weaknessScore - a.weaknessScore;
      return (a.lastReviewedAt?.getTime() ?? 0) - (b.lastReviewedAt?.getTime() ?? 0);
    });

  return scored.slice(0, limit).map(({ id, weaknessScore }) => ({ id, weaknessScore }));
}

export async function getRecentlyLearnedChunkIds(
  userId: string,
  limit: number,
  excludeIds: string[] = [],
  sinceHours = RECENT_WINDOW_HOURS,
  documentIds?: string[]
): Promise<string[]> {
  const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000);
  const attempts = await prisma.attempt.findMany({
    where: {
      passed: true,
      session: { userId },
      createdAt: { gte: since },
      ...(excludeIds.length > 0 ? { chunkId: { notIn: excludeIds } } : {}),
      ...(documentIds ? { chunk: { documentId: { in: documentIds } } } : {}),
    },
    distinct: ["chunkId"],
    orderBy: { createdAt: "desc" },
    select: { chunkId: true },
    take: limit,
  });
  return attempts.map((attempt) => attempt.chunkId);
}

async function getBackfillChunkIds(
  userId: string,
  limit: number,
  excludeIds: string[],
  documentIds?: string[]
): Promise<string[]> {
  if (limit <= 0) return [];
  const attempts = await prisma.attempt.findMany({
    where: {
      passed: true,
      session: { userId },
      ...(excludeIds.length > 0 ? { chunkId: { notIn: excludeIds } } : {}),
      ...(documentIds ? { chunk: { documentId: { in: documentIds } } } : {}),
    },
    distinct: ["chunkId"],
    orderBy: { createdAt: "desc" },
    select: { chunkId: true },
    take: limit,
  });
  return attempts.map((attempt) => attempt.chunkId);
}

export async function selectDailyQuizChunkIds(
  userId: string,
  excludeChunkIds: string[] = [],
  documentIds?: string[]
): Promise<string[]> {
  const selected = new Set<string>();

  const weak = await getWeakChunks(userId, DAILY_QUIZ_WEAK_SLOTS, excludeChunkIds, documentIds);
  weak.forEach((chunk) => selected.add(chunk.id));

  const recent = await getRecentlyLearnedChunkIds(
    userId,
    DAILY_QUIZ_RECENT_SLOTS,
    [...excludeChunkIds, ...selected],
    RECENT_WINDOW_HOURS,
    documentIds
  );
  recent.forEach((id) => selected.add(id));

  if (selected.size < DAILY_QUIZ_TOTAL) {
    const moreWeak = await getWeakChunks(
      userId,
      DAILY_QUIZ_TOTAL - selected.size,
      [...excludeChunkIds, ...selected],
      documentIds
    );
    moreWeak.forEach((chunk) => selected.add(chunk.id));
  }

  if (selected.size < DAILY_QUIZ_TOTAL) {
    const backfill = await getBackfillChunkIds(
      userId,
      DAILY_QUIZ_TOTAL - selected.size,
      [...excludeChunkIds, ...selected],
      documentIds
    );
    backfill.forEach((id) => selected.add(id));
  }

  return Array.from(selected);
}

export async function getExcludedChunkIdsFromLastDailyQuiz(userId: string, spaceId?: string): Promise<string[]> {
  const lastQuiz = await prisma.quiz.findFirst({
    where: { userId, kind: "daily", status: "completed", spaceId: spaceId ?? null },
    orderBy: { completedAt: "desc" },
    include: { items: { include: { quizQuestion: { select: { chunkId: true } } } } },
  });
  if (!lastQuiz) return [];
  return Array.from(new Set(lastQuiz.items.map((item) => item.quizQuestion.chunkId)));
}

export async function ensureQuizQuestion(userId: string, chunk: { id: string; content: string }) {
  const existing = await prisma.quizQuestion.findFirst({ where: { chunkId: chunk.id } });
  if (existing) return existing;

  const generated = await generateQuizQuestionGated(userId, chunk.content);
  return prisma.quizQuestion.create({
    data: {
      chunkId: chunk.id,
      question: generated.question,
      options: generated.options,
      correctIndex: generated.correctIndex,
    },
  });
}

export function serializeQuiz(quiz: Awaited<ReturnType<typeof createQuiz>>) {
  return {
    quizId: quiz.id,
    kind: quiz.kind,
    status: quiz.status,
    score: quiz.score,
    totalQuestions: quiz.totalQuestions,
    items: quiz.items.map((item) => ({
      quizItemId: item.id,
      question: item.quizQuestion.question,
      options: item.quizQuestion.options as string[],
      answered: item.answeredAt !== null,
      selectedIndex: item.selectedIndex,
      correct: item.correct,
    })),
  };
}

export async function createQuiz(
  userId: string,
  kind: "module" | "daily",
  documentId: string | null,
  chunkIds: string[],
  spaceId: string | null = null
) {
  const chunks = await prisma.chunk.findMany({
    where: { id: { in: chunkIds }, document: { userId } },
    select: { id: true, content: true },
  });
  const chunkById = new Map(chunks.map((chunk) => [chunk.id, chunk]));

  const questions = [];
  for (const chunkId of chunkIds) {
    const chunk = chunkById.get(chunkId);
    if (!chunk) continue;
    questions.push(await ensureQuizQuestion(userId, chunk));
  }

  return prisma.quiz.create({
    data: {
      userId,
      kind,
      documentId,
      spaceId,
      totalQuestions: questions.length,
      items: {
        create: questions.map((question, index) => ({ quizQuestionId: question.id, order: index })),
      },
    },
    include: {
      items: {
        orderBy: { order: "asc" },
        include: { quizQuestion: true },
      },
    },
  });
}
