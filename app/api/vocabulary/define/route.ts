import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { lookupDefinition } from "@/lib/dictionary";
import { defineWordSchema } from "@/lib/validation";

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = defineWordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "A word is required." }, { status: 400 });
  }

  const result = await lookupDefinition(parsed.data.word);
  return NextResponse.json(result);
}
