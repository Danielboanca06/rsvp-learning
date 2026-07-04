import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const document = await prisma.document.findUnique({
    where: { id },
    include: { chunks: { orderBy: { order: "asc" } } },
  });

  if (!document) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const passedAttempts = await prisma.attempt.findMany({
    where: { passed: true, chunk: { documentId: id } },
    distinct: ["chunkId"],
    select: { chunkId: true },
  });
  const masteredChunkIds = new Set(passedAttempts.map((attempt) => attempt.chunkId));

  const activeSession = await prisma.session.findFirst({
    where: { documentId: id, status: "active" },
    orderBy: { startedAt: "desc" },
  });

  return NextResponse.json({
    document,
    masteredChunkIds: Array.from(masteredChunkIds),
    activeSession,
  });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.document.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
