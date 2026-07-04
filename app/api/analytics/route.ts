import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const documents = await prisma.document.findMany({
    orderBy: { createdAt: "desc" },
    include: { chunks: { select: { id: true } } },
  });

  const attempts = await prisma.attempt.findMany({
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

  return NextResponse.json({ documents: documentStats, scoreHistory, wpmHistory, totals });
}
