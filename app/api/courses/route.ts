import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { createCourse, courseProgressPct } from "@/lib/course";
import { llmGateErrorResponse } from "@/lib/llm-quota";
import { CourseGenParseError, LlmGatewayUnavailableError } from "@/lib/llm";
import { createCourseSchema } from "@/lib/validation";

// Syllabus generation is a single long LLM call with a repair retry — needs the
// same Fluid Compute extension as document chunking.
export const maxDuration = 180;

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const courses = await prisma.course.findMany({
    where: { userId, status: { not: "archived" } },
    orderBy: { createdAt: "desc" },
    include: { modules: { orderBy: { order: "asc" }, select: { status: true } } },
  });

  return NextResponse.json({
    courses: courses.map((course) => ({
      id: course.id,
      title: course.title,
      goal: course.goal,
      status: course.status,
      createdAt: course.createdAt,
      moduleCount: course.modules.length,
      progressPct: courseProgressPct(course.modules),
    })),
  });
}

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = createCourseSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "A learning goal and intake answers are required.";
    const path = parsed.error.issues[0]?.path.join(".");
    return NextResponse.json({ error: path ? `${path}: ${message}` : message }, { status: 400 });
  }

  try {
    const course = await createCourse(userId, parsed.data);
    return NextResponse.json({ course }, { status: 201 });
  } catch (error) {
    const response = llmGateErrorResponse(error);
    if (response) return response;
    if (error instanceof CourseGenParseError || error instanceof LlmGatewayUnavailableError) {
      return NextResponse.json(
        { error: "Course generation failed — your credits were not spent. Please try again." },
        { status: 502 }
      );
    }
    throw error;
  }
}
