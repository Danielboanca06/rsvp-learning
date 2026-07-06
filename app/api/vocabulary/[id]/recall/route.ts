import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { gradeWordRecallGated, llmGateErrorResponse } from "@/lib/llm-quota";
import { recallSubmitSchema } from "@/lib/validation";
import { pointsEventData } from "@/lib/points";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = recallSubmitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "A definition is required." }, { status: 400 });
  }

  const word = await prisma.vocabularyWord.findFirst({ where: { id, userId } });
  if (!word) {
    return NextResponse.json({ error: "Word not found" }, { status: 404 });
  }

  let grading;
  try {
    grading = await gradeWordRecallGated(userId, word.word, word.definition, parsed.data.definition);
  } catch (error) {
    const response = llmGateErrorResponse(error);
    if (response) return response;
    throw error;
  }

  await prisma.$transaction([
    prisma.vocabularyWord.update({
      where: { id },
      data: { lastRecalledAt: new Date(), recallCount: { increment: 1 } },
    }),
    ...(grading.correct ? [prisma.pointsEvent.create({ data: pointsEventData(userId, "word_recalled") })] : []),
  ]);

  return NextResponse.json({
    correct: grading.correct,
    score: grading.score,
    feedback: grading.feedback,
    actualDefinition: word.definition,
  });
}
