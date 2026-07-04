import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { chunkDocument } from "@/lib/ollama";
import { createDocumentSchema } from "@/lib/validation";
import { PDFParse } from "pdf-parse";

export async function GET() {
  const documents = await prisma.document.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      chunks: { select: { id: true } },
      sessions: { select: { id: true, completedAt: true } },
    },
  });

  const documentsWithMastery = await Promise.all(
    documents.map(async (document) => {
      const passedAttempts = await prisma.attempt.findMany({
        where: { passed: true, chunk: { documentId: document.id } },
        distinct: ["chunkId"],
        select: { chunkId: true },
      });

      const totalChunks = document.chunks.length;
      const masteredChunks = passedAttempts.length;

      return {
        id: document.id,
        title: document.title,
        createdAt: document.createdAt,
        startingWpm: document.startingWpm,
        totalChunks,
        masteredChunks,
        masteryPct: totalChunks === 0 ? 0 : Math.round((masteredChunks / totalChunks) * 100),
        sessionCount: document.sessions.length,
      };
    })
  );

  return NextResponse.json({ documents: documentsWithMastery });
}

async function extractTextFromFile(file: File): Promise<string> {
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const buffer = Buffer.from(await file.arrayBuffer());

  if (!isPdf) {
    return buffer.toString("utf-8");
  }

  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  return result.text;
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file");
  const rawText = formData.get("text");
  const rawTitle = formData.get("title");

  let text = "";
  let derivedTitle = "";

  if (file instanceof File && file.size > 0) {
    text = await extractTextFromFile(file);
    derivedTitle = file.name.replace(/\.[^/.]+$/, "");
  } else if (typeof rawText === "string") {
    text = rawText;
  }

  const title = typeof rawTitle === "string" && rawTitle.trim().length > 0 ? rawTitle : derivedTitle || "Untitled Document";

  const parsed = createDocumentSchema.safeParse({ title, text });
  if (!parsed.success) {
    return NextResponse.json({ error: "A document title and non-empty text are required." }, { status: 400 });
  }

  const modules = await chunkDocument(parsed.data.text);

  const document = await prisma.document.create({
    data: {
      title: parsed.data.title,
      chunks: {
        create: modules.map((module, index) => ({
          order: index,
          title: module.title,
          content: module.content,
          wordCount: module.content.split(/\s+/).filter(Boolean).length,
        })),
      },
    },
    include: { chunks: { orderBy: { order: "asc" } } },
  });

  return NextResponse.json({ document }, { status: 201 });
}
