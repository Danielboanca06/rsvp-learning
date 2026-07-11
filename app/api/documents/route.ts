import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { chunkDocumentGated, llmGateErrorResponse } from "@/lib/llm-quota";
import { createDocumentSchema } from "@/lib/validation";
import { resolveSpaceId, SpaceNotFoundError } from "@/lib/spaces";
import { markdownToWords } from "@/lib/markdown";
import { PDFParse } from "pdf-parse";

// Chunking calls the LLM gateway with a 180s outer timeout (lib/llm.ts) — exceeds
// Vercel's default 60s function cap, so this needs Fluid Compute enabled on the
// project (extends Hobby-tier functions to 300s max).
export const maxDuration = 180;

// Upload caps enforced BEFORE any chunking spend: a giant PDF costs real LLM
// money and would blow the request budget anyway.
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_PDF_PAGES = 100;
const MAX_TEXT_WORDS = 60_000;

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const documents = await prisma.document.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      chunks: { select: { id: true } },
      sessions: { select: { id: true, completedAt: true } },
      space: { select: { name: true } },
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
        spaceId: document.spaceId,
        spaceName: document.space.name,
        totalChunks,
        masteredChunks,
        masteryPct: totalChunks === 0 ? 0 : Math.round((masteredChunks / totalChunks) * 100),
        sessionCount: document.sessions.length,
      };
    })
  );

  return NextResponse.json({ documents: documentsWithMastery });
}

class UploadLimitError extends Error {}

async function extractTextFromFile(file: File): Promise<string> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new UploadLimitError("That file is too large — the limit is 10 MB.");
  }

  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const buffer = Buffer.from(await file.arrayBuffer());

  if (!isPdf) {
    return buffer.toString("utf-8");
  }

  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  if (result.total > MAX_PDF_PAGES) {
    throw new UploadLimitError(`That PDF has ${result.total} pages — the limit is ${MAX_PDF_PAGES}.`);
  }
  return result.text;
}

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file");
  const rawText = formData.get("text");
  const rawTitle = formData.get("title");
  const rawSpaceId = formData.get("spaceId");

  let text = "";
  let derivedTitle = "";

  if (file instanceof File && file.size > 0) {
    try {
      text = await extractTextFromFile(file);
    } catch (error) {
      if (error instanceof UploadLimitError) {
        return NextResponse.json({ error: error.message }, { status: 413 });
      }
      throw error;
    }
    derivedTitle = file.name.replace(/\.[^/.]+$/, "");
  } else if (typeof rawText === "string") {
    text = rawText;
  }

  if (markdownToWords(text).length > MAX_TEXT_WORDS) {
    return NextResponse.json(
      { error: `That document is too long (over ${MAX_TEXT_WORDS.toLocaleString()} words). Split it into parts.` },
      { status: 413 }
    );
  }

  const title = typeof rawTitle === "string" && rawTitle.trim().length > 0 ? rawTitle : derivedTitle || "Untitled Document";

  const parsed = createDocumentSchema.safeParse({ title, text });
  if (!parsed.success) {
    return NextResponse.json({ error: "A document title and non-empty text are required." }, { status: 400 });
  }

  let spaceId: string;
  try {
    spaceId = await resolveSpaceId(userId, typeof rawSpaceId === "string" && rawSpaceId.trim() ? rawSpaceId : null);
  } catch (error) {
    if (error instanceof SpaceNotFoundError) {
      return NextResponse.json({ error: "The selected space does not exist." }, { status: 400 });
    }
    throw error;
  }

  let modules;
  try {
    modules = await chunkDocumentGated(userId, parsed.data.text);
  } catch (error) {
    const response = llmGateErrorResponse(error);
    if (response) return response;
    throw error;
  }

  const document = await prisma.document.create({
    data: {
      userId,
      title: parsed.data.title,
      spaceId,
      chunks: {
        create: modules.map((module, index) => ({
          order: index,
          title: module.title,
          content: module.content,
          wordCount: markdownToWords(module.content).length,
          sectionTitle: module.sectionTitle,
          keyPoints: module.keyPoints,
        })),
      },
    },
    include: { chunks: { orderBy: { order: "asc" } } },
  });

  return NextResponse.json({ document }, { status: 201 });
}
