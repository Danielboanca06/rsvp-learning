// Send a user message to a thread and stream the assistant's turn back as
// Server-Sent Events (see lib/chat/protocol.ts for the event schema). Quota is
// reserved BEFORE the stream opens so a blocked user gets a normal 429 JSON
// response the existing UpgradePrompt flow already understands.
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { sendChatMessageSchema } from "@/lib/validation";
import { encodeSseEvent, type ChatStreamEvent } from "@/lib/chat/protocol";
import { runAssistantTurn } from "@/lib/chat/orchestrator";
import { recordChatUsage, reserveChatTurn } from "@/lib/llm-quota";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = sendChatMessageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "A message is required." }, { status: 400 });
  }

  const thread = await prisma.chatThread.findFirst({ where: { id, userId }, select: { id: true } });
  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  const gate = await reserveChatTurn(userId);
  if (!gate.ok) {
    const message =
      gate.reason === "quota_exceeded"
        ? "Free plan AI quota exceeded for this period. Upgrade to Pro for more."
        : "Not enough credits to run this AI action. Buy more credits to continue.";
    return NextResponse.json({ error: message, reason: gate.reason }, { status: 429 });
  }

  await prisma.chatMessage.create({
    data: { threadId: thread.id, role: "user", parts: [{ type: "text", text: parsed.data.content }] },
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const emit = (event: ChatStreamEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(encodeSseEvent(event)));
        } catch {
          // Client disconnected mid-stream; the turn keeps running so the
          // assistant message is still persisted for when they reload.
          closed = true;
        }
      };

      try {
        await runAssistantTurn({ threadId: thread.id, userId, tier: gate.tier, emit });
        await recordChatUsage(userId, gate);
      } catch (error) {
        console.error("Chat stream failed:", error);
        emit({ type: "error", code: "stream_failed", message: "The AI could not finish its reply." });
      } finally {
        if (!closed) controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
