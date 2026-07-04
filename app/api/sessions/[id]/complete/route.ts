import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { completeSession } from "@/lib/session";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await prisma.session.findUnique({ where: { id } });
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (session.status === "active") {
    await completeSession(id);
  }

  return NextResponse.json({ success: true });
}
