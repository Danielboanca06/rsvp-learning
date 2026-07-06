import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { submitQuizAnswerSchema } from "@/lib/validation";
import { pointsEventData } from "@/lib/points";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = submitQuizAnswerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "A quizItemId and selectedIndex (0-3) are required." }, { status: 400 });
  }

  const quizItem = await prisma.quizItem.findUnique({
    where: { id: parsed.data.quizItemId },
    include: { quiz: true, quizQuestion: true },
  });

  if (!quizItem || quizItem.quizId !== id || quizItem.quiz.userId !== userId) {
    return NextResponse.json({ error: "Quiz item not found for this quiz" }, { status: 404 });
  }

  if (quizItem.answeredAt) {
    return NextResponse.json({
      correct: quizItem.correct,
      correctIndex: quizItem.quizQuestion.correctIndex,
      quiz: {
        status: quizItem.quiz.status,
        score: quizItem.quiz.score,
        totalQuestions: quizItem.quiz.totalQuestions,
      },
    });
  }

  const correct = parsed.data.selectedIndex === quizItem.quizQuestion.correctIndex;
  const answeredCountBefore = await prisma.quizItem.count({
    where: { quizId: id, answeredAt: { not: null } },
  });
  const isLast = answeredCountBefore + 1 >= quizItem.quiz.totalQuestions;

  const operations: Prisma.PrismaPromise<unknown>[] = [
    prisma.quizItem.update({
      where: { id: quizItem.id },
      data: { selectedIndex: parsed.data.selectedIndex, correct, answeredAt: new Date() },
    }),
    prisma.quiz.update({
      where: { id },
      data: {
        score: { increment: correct ? 1 : 0 },
        ...(isLast ? { status: "completed", completedAt: new Date() } : {}),
      },
    }),
  ];

  if (correct) {
    operations.push(prisma.pointsEvent.create({ data: pointsEventData(userId, "quiz_correct") }));
  } else {
    operations.push(
      prisma.chunk.update({
        where: { id: quizItem.quizQuestion.chunkId },
        data: { quizWrongCount: { increment: 1 } },
      })
    );
  }

  await prisma.$transaction(operations);

  return NextResponse.json({
    correct,
    correctIndex: quizItem.quizQuestion.correctIndex,
    quiz: {
      status: isLast ? "completed" : quizItem.quiz.status,
      score: quizItem.quiz.score + (correct ? 1 : 0),
      totalQuestions: quizItem.quiz.totalQuestions,
    },
  });
}
