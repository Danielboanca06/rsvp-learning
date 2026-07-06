import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { addVocabularySchema } from "@/lib/validation";

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sort = request.nextUrl.searchParams.get("sort") === "az" ? "az" : "recent";

  const words = await prisma.vocabularyWord.findMany({
    where: { userId },
    orderBy: sort === "az" ? { word: "asc" } : { createdAt: "desc" },
  });

  return NextResponse.json({ words });
}

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = addVocabularySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "A word and definition are required." }, { status: 400 });
  }

  const normalizedWord = parsed.data.word.toLowerCase();

  const word = await prisma.vocabularyWord.upsert({
    where: { userId_word: { userId, word: normalizedWord } },
    update: {},
    create: {
      userId,
      word: normalizedWord,
      definition: parsed.data.definition,
      documentId: parsed.data.documentId,
      chunkId: parsed.data.chunkId,
    },
  });

  return NextResponse.json({ word }, { status: 201 });
}
