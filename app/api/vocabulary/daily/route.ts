import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const word = await prisma.vocabularyWord.findFirst({
    where: { userId },
    orderBy: [{ lastRecalledAt: "asc" }, { createdAt: "asc" }],
    select: { id: true, word: true },
  });

  return NextResponse.json({ word });
}
