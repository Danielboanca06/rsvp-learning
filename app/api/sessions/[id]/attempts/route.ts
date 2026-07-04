import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { gradeSummary } from "@/lib/ollama";
import { nextWpm } from "@/lib/wpm";
import { submitAttemptSchema } from "@/lib/validation";
import { completeSession, findNextChunk } from "@/lib/session";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = submitAttemptSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "A chunkId and non-empty summary are required." }, { status: 400 });
  }

  const session = await prisma.session.findUnique({ where: { id } });
  if (!session || session.status !== "active") {
    return NextResponse.json({ error: "Session not found or already completed" }, { status: 404 });
  }

  const chunk = await prisma.chunk.findUnique({ where: { id: parsed.data.chunkId } });
  if (!chunk || chunk.documentId !== session.documentId) {
    return NextResponse.json({ error: "Chunk not found for this session's document" }, { status: 404 });
  }

  const grading = await gradeSummary(chunk.content, parsed.data.summary);
  const passed = grading.score >= 80;
  const updatedWpm = nextWpm(session.currentWpm, passed);

  await prisma.attempt.create({
    data: {
      sessionId: session.id,
      chunkId: chunk.id,
      summary: parsed.data.summary,
      score: grading.score,
      hint: grading.hint,
      socraticQuestion: grading.socraticQuestion,
      wpmAtAttempt: session.currentWpm,
      passed,
    },
  });

  await prisma.session.update({ where: { id: session.id }, data: { currentWpm: updatedWpm } });

  if (!passed) {
    return NextResponse.json({
      score: grading.score,
      hint: grading.hint,
      socraticQuestion: grading.socraticQuestion,
      passed,
      newWpm: updatedWpm,
      nextChunk: null,
      documentComplete: false,
    });
  }

  const upcomingChunk = await findNextChunk(session.documentId, chunk.order);

  if (!upcomingChunk) {
    await completeSession(session.id);
  }

  return NextResponse.json({
    score: grading.score,
    hint: grading.hint,
    socraticQuestion: grading.socraticQuestion,
    passed,
    newWpm: updatedWpm,
    nextChunk: upcomingChunk,
    documentComplete: !upcomingChunk,
  });
}
