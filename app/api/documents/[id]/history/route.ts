import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const attempts = await prisma.attempt.findMany({
    where: { chunk: { documentId: id } },
    orderBy: { createdAt: "desc" },
    include: { chunk: { select: { title: true, order: true } } },
  });

  return NextResponse.json({ attempts });
}
