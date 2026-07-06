import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();

  const dueChunks = await prisma.chunk.findMany({
    where: { dueAt: { lte: now }, document: { userId } },
    orderBy: { dueAt: "asc" },
    include: { document: { select: { id: true, title: true } } },
  });

  return NextResponse.json({ dueCount: dueChunks.length, chunks: dueChunks });
}

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();

  const dueChunks = await prisma.chunk.findMany({
    where: { dueAt: { lte: now }, document: { userId } },
    orderBy: { dueAt: "asc" },
    include: { document: { select: { id: true, title: true, startingWpm: true } } },
  });

  if (dueChunks.length === 0) {
    return NextResponse.json({ error: "Nothing is due for review right now." }, { status: 400 });
  }

  const averageWpm =
    Math.round(dueChunks.reduce((sum, chunk) => sum + chunk.document.startingWpm, 0) / dueChunks.length / 10) * 10;

  const session = await prisma.session.create({
    data: {
      userId,
      type: "review",
      currentWpm: averageWpm,
      status: "active",
    },
  });

  return NextResponse.json({ session, chunks: dueChunks }, { status: 201 });
}
