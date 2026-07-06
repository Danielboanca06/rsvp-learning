import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const document = await prisma.document.findFirst({ where: { id, userId }, select: { id: true } });
  if (!document) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const attempts = await prisma.attempt.findMany({
    where: { chunk: { documentId: id } },
    orderBy: { createdAt: "desc" },
    include: { chunk: { select: { title: true, order: true } } },
  });

  return NextResponse.json({ attempts });
}
