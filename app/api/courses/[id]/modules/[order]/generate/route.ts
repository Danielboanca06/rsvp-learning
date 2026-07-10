import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  CourseNotFoundError,
  ModuleNotFoundError,
  ModuleStateError,
  generateModule,
} from "@/lib/course";
import { llmGateErrorResponse } from "@/lib/llm-quota";
import { CourseGenParseError, LlmGatewayUnavailableError } from "@/lib/llm";

// Module generation is a long LLM call (plus a possible repair retry) — needs
// the same Fluid Compute extension as document chunking.
export const maxDuration = 180;

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string; order: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, order: rawOrder } = await params;
  const order = Number(rawOrder);
  if (!Number.isInteger(order) || order < 0) {
    return NextResponse.json({ error: "Invalid module order." }, { status: 400 });
  }

  try {
    const result = await generateModule(id, order, userId);
    return NextResponse.json(result);
  } catch (error) {
    const response = llmGateErrorResponse(error);
    if (response) return response;
    if (error instanceof CourseNotFoundError || error instanceof ModuleNotFoundError) {
      return NextResponse.json({ error: "Course or module not found." }, { status: 404 });
    }
    if (error instanceof ModuleStateError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof CourseGenParseError || error instanceof LlmGatewayUnavailableError) {
      return NextResponse.json(
        { error: "Module generation failed — your credits were refunded. Tap to retry.", status: "failed" },
        { status: 502 }
      );
    }
    throw error;
  }
}
