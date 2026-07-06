import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { createSpaceSchema } from "@/lib/validation";
import { ensureGeneralSpace } from "@/lib/spaces";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureGeneralSpace(userId);

  const spaces = await prisma.space.findMany({
    where: { userId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    include: { _count: { select: { documents: true } } },
  });

  return NextResponse.json({
    spaces: spaces.map((space) => ({
      id: space.id,
      name: space.name,
      isDefault: space.isDefault,
      createdAt: space.createdAt,
      documentCount: space._count.documents,
    })),
  });
}

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = createSpaceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "A space name is required." }, { status: 400 });
  }

  const space = await prisma.space.create({ data: { userId, name: parsed.data.name } });
  return NextResponse.json({ space }, { status: 201 });
}
