import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { createModuleQuizSchema } from "@/lib/validation";
import { createQuiz, serializeQuiz } from "@/lib/quiz";
import { llmGateErrorResponse } from "@/lib/llm-quota";

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = createModuleQuizSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "A chunkId is required." }, { status: 400 });
  }

  const chunk = await prisma.chunk.findFirst({ where: { id: parsed.data.chunkId, document: { userId } } });
  if (!chunk) {
    return NextResponse.json({ error: "Chunk not found" }, { status: 404 });
  }

  try {
    const quiz = await createQuiz(userId, "module", chunk.documentId, [chunk.id]);
    return NextResponse.json(serializeQuiz(quiz), { status: 201 });
  } catch (error) {
    const response = llmGateErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
