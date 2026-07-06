import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const document = await prisma.document.findFirst({
    where: { id, userId },
    select: { id: true, title: true },
  });

  if (!document) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const chunks = await prisma.chunk.findMany({
    where: { documentId: id },
    orderBy: { order: "asc" },
  });

  const attempts = await prisma.attempt.findMany({
    where: { chunk: { documentId: id } },
    orderBy: { createdAt: "desc" },
  });

  const segments = chunks.map((chunk) => {
    const chunkAttempts = attempts.filter((attempt) => attempt.chunkId === chunk.id);
    const bestAttempt = chunkAttempts.find((attempt) => attempt.passed) ?? chunkAttempts[0] ?? null;

    return {
      chunkId: chunk.id,
      order: chunk.order,
      title: chunk.title,
      content: chunk.content,
      summary: bestAttempt?.summary ?? null,
      passed: bestAttempt?.passed ?? false,
    };
  });

  return NextResponse.json({ document, segments });
}
