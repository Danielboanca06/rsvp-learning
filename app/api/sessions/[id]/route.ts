import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { updateSessionWpmSchema } from "@/lib/validation";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const session = await prisma.session.findFirst({ where: { id, userId } });
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  return NextResponse.json({ session });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = updateSessionWpmSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "A valid currentWpm is required." }, { status: 400 });
  }

  const session = await prisma.session.findFirst({ where: { id, userId } });
  if (!session || session.status !== "active") {
    return NextResponse.json({ error: "Session not found or already completed" }, { status: 404 });
  }

  const updated = await prisma.session.update({
    where: { id: session.id },
    data: { currentWpm: parsed.data.currentWpm },
  });

  return NextResponse.json({ session: updated });
}
