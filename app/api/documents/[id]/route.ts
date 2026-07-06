import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const document = await prisma.document.findFirst({
    where: { id, userId },
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
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await prisma.document.deleteMany({ where: { id, userId } });
  return NextResponse.json({ success: true });
}
