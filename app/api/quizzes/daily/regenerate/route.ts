import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createQuiz, getExcludedChunkIdsFromLastDailyQuiz, selectDailyQuizChunkIds, serializeQuiz } from "@/lib/quiz";
import { llmGateErrorResponse } from "@/lib/llm-quota";

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const excludeChunkIds = await getExcludedChunkIdsFromLastDailyQuiz(userId);
  const chunkIds = await selectDailyQuizChunkIds(userId, excludeChunkIds);
  try {
    const quiz = await createQuiz(userId, "daily", null, chunkIds, null);
    return NextResponse.json(serializeQuiz(quiz), { status: 201 });
  } catch (error) {
    const response = llmGateErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
