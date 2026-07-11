import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { courseProgressPct } from "@/lib/course";
import { updateCourseSchema } from "@/lib/validation";

async function loadCourse(id: string, userId: string) {
  return prisma.course.findFirst({
    where: { id, userId },
    include: { modules: { orderBy: { order: "asc" } } },
  });
}

function serializeCourse(course: NonNullable<Awaited<ReturnType<typeof loadCourse>>>) {
  return {
    id: course.id,
    title: course.title,
    goal: course.goal,
    status: course.status,
    spaceId: course.spaceId,
    createdAt: course.createdAt,
    progressPct: courseProgressPct(course.modules),
    modules: course.modules.map((module) => ({
      id: module.id,
      order: module.order,
      title: module.title,
      summary: module.summary,
      objectives: module.objectives,
      status: module.status,
      documentId: module.documentId,
    })),
  };
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const course = await loadCourse(id, userId);
  if (!course) return NextResponse.json({ error: "Course not found." }, { status: 404 });

  return NextResponse.json({ course: serializeCourse(course) });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = updateCourseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid course update." }, { status: 400 });
  }

  const course = await loadCourse(id, userId);
  if (!course) return NextResponse.json({ error: "Course not found." }, { status: 404 });

  const { modules, status } = parsed.data;

  if (modules) {
    if (course.status !== "draft") {
      return NextResponse.json({ error: "The syllabus can only be edited while the course is a draft." }, { status: 409 });
    }
    const knownIds = new Set(course.modules.map((module) => module.id));
    if (!modules.every((module) => knownIds.has(module.id))) {
      return NextResponse.json({ error: "Unknown module in syllabus edit." }, { status: 400 });
    }

    const keptIds = new Set(modules.map((module) => module.id));
    await prisma.$transaction(async (tx) => {
      await tx.courseModule.deleteMany({ where: { courseId: course.id, id: { notIn: [...keptIds] } } });
      // Two-phase reorder: park orders out of range first so the unique
      // [courseId, order] constraint never collides mid-shuffle.
      for (const [index, module] of modules.entries()) {
        await tx.courseModule.update({ where: { id: module.id }, data: { order: index + 1000 } });
      }
      for (const [index, module] of modules.entries()) {
        await tx.courseModule.update({
          where: { id: module.id },
          data: {
            order: index,
            title: module.title,
            // Draft modules carry no generated content yet: re-derive the
            // lock states so exactly the first module is startable.
            status: index === 0 ? "unlocked" : "locked",
          },
        });
      }
    });
  }

  if (status === "active" && course.status !== "draft") {
    return NextResponse.json({ error: "Only a draft course can be activated." }, { status: 409 });
  }
  if (status) {
    await prisma.course.update({ where: { id: course.id }, data: { status } });
  }

  const updated = await loadCourse(id, userId);
  return NextResponse.json({ course: serializeCourse(updated!) });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const course = await prisma.course.findFirst({ where: { id, userId }, select: { id: true } });
  if (!course) return NextResponse.json({ error: "Course not found." }, { status: 404 });

  // Archive, never hard-delete: generated documents, attempts and review state
  // stay intact (and readable) — the course just leaves the active lists.
  await prisma.course.update({ where: { id: course.id }, data: { status: "archived" } });
  return NextResponse.json({ ok: true });
}
