import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { createQuiz, selectDailyQuizChunkIds, serializeQuiz } from "@/lib/quiz";
import { llmGateErrorResponse } from "@/lib/llm-quota";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const active = await prisma.quiz.findFirst({
    where: { userId, kind: "daily", status: "active", spaceId: null },
    orderBy: { createdAt: "desc" },
    include: { items: { orderBy: { order: "asc" }, include: { quizQuestion: true } } },
  });

  if (active) {
    return NextResponse.json(serializeQuiz(active));
  }

  const chunkIds = await selectDailyQuizChunkIds(userId);
  try {
    const quiz = await createQuiz(userId, "daily", null, chunkIds, null);
    return NextResponse.json(serializeQuiz(quiz), { status: 201 });
  } catch (error) {
    const response = llmGateErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
