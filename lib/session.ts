import { prisma } from "@/lib/prisma";

export async function completeSession(sessionId: string) {
  const session = await prisma.session.update({
    where: { id: sessionId },
    data: { status: "completed", completedAt: new Date() },
  });

  if (session.documentId) {
    await prisma.document.update({
      where: { id: session.documentId },
      data: { startingWpm: session.currentWpm },
    });
  }

  return session;
}

export async function findNextChunk(documentId: string, afterOrder: number) {
  return prisma.chunk.findFirst({
    where: { documentId, order: { gt: afterOrder } },
    orderBy: { order: "asc" },
  });
}
