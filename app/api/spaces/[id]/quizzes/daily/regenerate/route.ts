import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { createQuiz, getExcludedChunkIdsFromLastDailyQuiz, selectDailyQuizChunkIds, serializeQuiz } from "@/lib/quiz";
import { llmGateErrorResponse } from "@/lib/llm-quota";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: spaceId } = await params;

  const space = await prisma.space.findFirst({ where: { id: spaceId, userId } });
  if (!space) {
    return NextResponse.json({ error: "Space not found" }, { status: 404 });
  }

  const documents = await prisma.document.findMany({ where: { spaceId }, select: { id: true } });
  const documentIds = documents.map((document) => document.id);

  const excludeChunkIds = await getExcludedChunkIdsFromLastDailyQuiz(userId, spaceId);
  const chunkIds = await selectDailyQuizChunkIds(userId, excludeChunkIds, documentIds);
  try {
    const quiz = await createQuiz(userId, "daily", null, chunkIds, spaceId);
    return NextResponse.json(serializeQuiz(quiz), { status: 201 });
  } catch (error) {
    const response = llmGateErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
