import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { createChatThreadSchema } from "@/lib/validation";
import { practiceKickoffMessage } from "@/lib/chat/prompts";

function threadTitle(kind: "selection" | "practice", selectionText: string): string {
  const excerpt = selectionText.length > 60 ? `${selectionText.slice(0, 57).trimEnd()}...` : selectionText;
  return kind === "practice" ? `Practice: ${excerpt}` : excerpt;
}

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = createChatThreadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid thread request." }, { status: 400 });
  }
  const { kind, documentId, chunkId, selectionText, parentThreadId } = parsed.data;

  const chunk = await prisma.chunk.findFirst({
    where: { id: chunkId, documentId, document: { userId } },
    select: { id: true },
  });
  if (!chunk) {
    return NextResponse.json({ error: "Module not found." }, { status: 404 });
  }

  if (parentThreadId) {
    const parent = await prisma.chatThread.findFirst({ where: { id: parentThreadId, userId }, select: { id: true } });
    if (!parent) return NextResponse.json({ error: "Parent thread not found." }, { status: 404 });
  }

  const thread = await prisma.chatThread.create({
    data: {
      userId,
      kind,
      title: threadTitle(kind, selectionText),
      documentId,
      chunkId,
      selectionText,
      parentThreadId,
      // Practice threads open with a fixed kickoff instruction — the exercise
      // always starts the same way, so no LLM call (or quota spend) is needed.
      ...(kind === "practice"
        ? {
            messages: {
              create: {
                role: "assistant",
                parts: [{ type: "text", text: practiceKickoffMessage() }],
              },
            },
          }
        : {}),
    },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });

  return NextResponse.json({ thread }, { status: 201 });
}

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const documentId = request.nextUrl.searchParams.get("documentId");
  if (!documentId) {
    return NextResponse.json({ error: "documentId is required." }, { status: 400 });
  }

  const threads = await prisma.chatThread.findMany({
    where: { userId, documentId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      kind: true,
      title: true,
      documentId: true,
      chunkId: true,
      selectionText: true,
      parentThreadId: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { messages: true } },
    },
  });

  return NextResponse.json({ threads });
}
