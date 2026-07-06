import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { startSessionSchema } from "@/lib/validation";

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = startSessionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "A documentId is required." }, { status: 400 });
  }

  const document = await prisma.document.findFirst({
    where: { id: parsed.data.documentId, userId },
    include: { chunks: { orderBy: { order: "asc" } } },
  });

  if (!document) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  if (document.chunks.length === 0) {
    return NextResponse.json({ error: "This document has no modules to read." }, { status: 400 });
  }

  const passedAttempts = await prisma.attempt.findMany({
    where: { passed: true, chunk: { documentId: document.id } },
    distinct: ["chunkId"],
    select: { chunkId: true },
  });
  const masteredChunkIds = new Set(passedAttempts.map((attempt) => attempt.chunkId));
  const nextChunk = document.chunks.find((chunk) => !masteredChunkIds.has(chunk.id)) ?? null;

  const session = await prisma.session.create({
    data: {
      userId,
      documentId: document.id,
      currentWpm: document.startingWpm,
      status: nextChunk ? "active" : "completed",
      completedAt: nextChunk ? null : new Date(),
    },
  });

  return NextResponse.json({ session, chunk: nextChunk, documentComplete: nextChunk === null }, { status: 201 });
}
