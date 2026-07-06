import { prisma } from "@/lib/prisma";

const RECENT_DOCUMENTS_LIMIT = 8;

export async function computeAnalytics(userId: string, documentIds?: string[]) {
  const documents = await prisma.document.findMany({
    where: { userId, ...(documentIds ? { id: { in: documentIds } } : {}) },
    orderBy: { createdAt: "desc" },
    include: { chunks: { select: { id: true } } },
  });

  const attempts = await prisma.attempt.findMany({
    where: { session: { userId }, ...(documentIds ? { chunk: { documentId: { in: documentIds } } } : {}) },
    orderBy: { createdAt: "asc" },
    include: { chunk: { select: { documentId: true } }, session: { select: { documentId: true } } },
  });

  const documentTitleById = new Map(documents.map((document) => [document.id, document.title]));

  const documentStats = await Promise.all(
    documents.map(async (document) => {
      const documentAttempts = attempts.filter((attempt) => attempt.chunk.documentId === document.id);
      const passedChunkIds = new Set(
        documentAttempts.filter((attempt) => attempt.passed).map((attempt) => attempt.chunkId)
      );
      const totalChunks = document.chunks.length;
      const averageScore =
        documentAttempts.length === 0
          ? null
          : Math.round(
              documentAttempts.reduce((sum, attempt) => sum + attempt.score, 0) / documentAttempts.length
            );

      return {
        id: document.id,
        title: document.title,
        createdAt: document.createdAt,
        totalChunks,
        masteredChunks: passedChunkIds.size,
        masteryPct: totalChunks === 0 ? 0 : Math.round((passedChunkIds.size / totalChunks) * 100),
        attemptCount: documentAttempts.length,
        averageScore,
      };
    })
  );

  const lastAttemptAtByDocumentId = new Map<string, number>();
  for (const attempt of attempts) {
    const documentId = attempt.chunk.documentId;
    const time = attempt.createdAt.getTime();
    const existing = lastAttemptAtByDocumentId.get(documentId);
    if (existing === undefined || time > existing) {
      lastAttemptAtByDocumentId.set(documentId, time);
    }
  }

  const recentDocuments = [...documentStats]
    .sort((a, b) => {
      const aTime = lastAttemptAtByDocumentId.get(a.id) ?? -Infinity;
      const bTime = lastAttemptAtByDocumentId.get(b.id) ?? -Infinity;
      if (bTime !== aTime) return bTime - aTime;
      return b.createdAt.getTime() - a.createdAt.getTime();
    })
    .slice(0, RECENT_DOCUMENTS_LIMIT);

  const scoreHistory = attempts.map((attempt) => ({
    createdAt: attempt.createdAt,
    score: attempt.score,
    passed: attempt.passed,
    documentTitle: documentTitleById.get(attempt.chunk.documentId) ?? "Unknown document",
  }));

  const wpmHistory = attempts.map((attempt) => ({
    createdAt: attempt.createdAt,
    wpm: attempt.wpmAtAttempt,
    documentTitle: documentTitleById.get(attempt.chunk.documentId) ?? "Unknown document",
  }));

  const totals = {
    documentCount: documents.length,
    attemptCount: attempts.length,
    averageScore:
      attempts.length === 0
        ? null
        : Math.round(attempts.reduce((sum, attempt) => sum + attempt.score, 0) / attempts.length),
  };

  const now = new Date();
  const dueCount = await prisma.chunk.count({
    where: {
      dueAt: { lte: now },
      document: { userId },
      ...(documentIds ? { documentId: { in: documentIds } } : {}),
    },
  });
  const nextDue = await prisma.chunk.findFirst({
    where: {
      dueAt: { gt: now },
      document: { userId },
      ...(documentIds ? { documentId: { in: documentIds } } : {}),
    },
    orderBy: { dueAt: "asc" },
    select: { dueAt: true },
  });

  return {
    documents: documentStats,
    recentDocuments,
    scoreHistory,
    wpmHistory,
    totals,
    review: { dueCount, nextDueAt: nextDue?.dueAt ?? null },
  };
}
