import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  CourseNotFoundError,
  ModuleNotFoundError,
  ModuleNotMasteredError,
  ModuleStateError,
  completeModule,
} from "@/lib/course";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string; order: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, order: rawOrder } = await params;
  const order = Number(rawOrder);
  if (!Number.isInteger(order) || order < 0) {
    return NextResponse.json({ error: "Invalid module order." }, { status: 400 });
  }

  try {
    const result = await completeModule(id, order, userId);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CourseNotFoundError || error instanceof ModuleNotFoundError) {
      return NextResponse.json({ error: "Course or module not found." }, { status: 404 });
    }
    if (error instanceof ModuleStateError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof ModuleNotMasteredError) {
      return NextResponse.json(
        { error: `Not quite mastered yet: ${error.message}.`, mastered: false },
        { status: 409 }
      );
    }
    throw error;
  }
}
