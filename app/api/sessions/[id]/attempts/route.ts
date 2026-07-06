import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { gradeSummaryGated, llmGateErrorResponse } from "@/lib/llm-quota";
import { nextWpm } from "@/lib/wpm";
import { scheduleNextReview } from "@/lib/fsrs";
import { submitAttemptSchema } from "@/lib/validation";
import { completeSession, findNextChunk } from "@/lib/session";
import { pointsEventData } from "@/lib/points";
import { shouldTriggerModuleQuiz } from "@/lib/quiz";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = submitAttemptSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "A chunkId and non-empty summary are required." }, { status: 400 });
  }

  const session = await prisma.session.findFirst({ where: { id, userId } });
  if (!session || session.status !== "active") {
    return NextResponse.json({ error: "Session not found or already completed" }, { status: 404 });
  }

  const chunk = await prisma.chunk.findUnique({ where: { id: parsed.data.chunkId } });
  if (!chunk || (session.type === "study" && chunk.documentId !== session.documentId)) {
    return NextResponse.json({ error: "Chunk not found for this session's document" }, { status: 404 });
  }

  let grading;
  try {
    grading = await gradeSummaryGated(userId, chunk.content, parsed.data.summary);
  } catch (error) {
    const response = llmGateErrorResponse(error);
    if (response) return response;
    throw error;
  }
  const passed = grading.score >= 80;
  const updatedWpm = nextWpm(session.currentWpm, passed);
  const memoryUpdate = scheduleNextReview(chunk, grading.score);

  await prisma.$transaction([
    prisma.attempt.create({
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
    }),
    prisma.session.update({ where: { id: session.id }, data: { currentWpm: updatedWpm } }),
    prisma.chunk.update({
      where: { id: chunk.id },
      data: {
        stability: memoryUpdate.stability,
        difficulty: memoryUpdate.difficulty,
        dueAt: memoryUpdate.dueAt,
        lastReviewedAt: memoryUpdate.lastReviewedAt,
        reviewState: memoryUpdate.reviewState,
        reps: memoryUpdate.reps,
        lapses: memoryUpdate.lapses,
      },
    }),
    ...(passed
      ? [
          prisma.pointsEvent.create({
            data: pointsEventData(userId, session.type === "review" ? "review_passed" : "chunk_passed"),
          }),
        ]
      : []),
  ]);

  if (session.type === "review") {
    return NextResponse.json({
      score: grading.score,
      hint: grading.hint,
      socraticQuestion: grading.socraticQuestion,
      passed,
      newWpm: updatedWpm,
      nextDueAt: memoryUpdate.dueAt,
      nextChunk: null,
      documentComplete: false,
    });
  }

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

  const upcomingChunk = await findNextChunk(session.documentId!, chunk.order);

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
    quizAvailable: upcomingChunk && shouldTriggerModuleQuiz(chunk.order) ? { chunkId: chunk.id } : null,
  });
}
