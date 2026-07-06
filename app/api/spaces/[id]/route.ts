import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { computeAnalytics } from "@/lib/analytics";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const space = await prisma.space.findFirst({ where: { id, userId } });
  if (!space) {
    return NextResponse.json({ error: "Space not found" }, { status: 404 });
  }

  const documentRows = await prisma.document.findMany({ where: { spaceId: id }, select: { id: true } });
  const documentIds = documentRows.map((document) => document.id);
  const analytics = await computeAnalytics(userId, documentIds);

  return NextResponse.json({
    space: { id: space.id, name: space.name, isDefault: space.isDefault },
    documents: analytics.documents,
  });
}
