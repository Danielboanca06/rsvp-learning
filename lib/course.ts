// Course pipeline: syllabus creation, lazy per-module content generation, and
// the mastery gate that unlocks the next module. Generated content becomes an
// ordinary Document (sourceType "generated") + Chunk rows inside the course's
// dedicated Space, so the entire existing learning loop — read flow, grading,
// quizzes, FSRS review, analytics — applies to it unchanged.
//
// Module status state machine:
//   locked → unlocked → generating → ready → completed
//                 ↑          ↓ (LLM/validation failure, credits refunded)
//                 └──────── failed  (retryable: failed → generating)
import { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";
import {
  generateCourseModuleContent,
  generateCourseSyllabus,
  type ModuleGenerationInput,
} from "@/lib/llm";
import {
  recordCourseGenUsage,
  refundLlmCredits,
  reserveLlmCall,
  throwForGate,
} from "@/lib/llm-quota";
import { markdownToWords } from "@/lib/markdown";
import type { LearnerBrief } from "@/lib/validation";

export class CourseNotFoundError extends Error {}
export class ModuleNotFoundError extends Error {}
/** The module is not in a state the requested transition allows. */
export class ModuleStateError extends Error {}
/** completeModule was called before the mastery gate was satisfied. */
export class ModuleNotMasteredError extends Error {}

const TEST_OUT_QUIZ_THRESHOLD = 0.8;

export async function createCourse(
  userId: string,
  input: { goal: string; brief: LearnerBrief },
  db: PrismaClient = defaultPrisma
) {
  const gate = await reserveLlmCall(userId, "coursegen_syllabus", db);
  if (!gate.ok) throwForGate(gate);

  let syllabus;
  try {
    syllabus = await generateCourseSyllabus(input.goal, input.brief, gate.tier);
  } catch (error) {
    await refundLlmCredits(userId, gate.creditsCharged, db);
    throw error;
  }
  await recordCourseGenUsage(userId, "coursegen_syllabus", gate, db);

  const space = await db.space.create({ data: { userId, name: syllabus.title } });
  return db.course.create({
    data: {
      userId,
      spaceId: space.id,
      title: syllabus.title,
      goal: input.goal,
      learnerBrief: input.brief,
      status: "draft",
      modules: {
        create: syllabus.modules.map((module, index) => ({
          order: index,
          title: module.title,
          summary: module.summary,
          objectives: module.objectives,
          status: index === 0 ? "unlocked" : "locked",
        })),
      },
    },
    include: { modules: { orderBy: { order: "asc" } } },
  });
}

async function loadCourseWithModules(courseId: string, userId: string, db: PrismaClient) {
  const course = await db.course.findFirst({
    where: { id: courseId, userId },
    include: { modules: { orderBy: { order: "asc" } } },
  });
  if (!course) throw new CourseNotFoundError(`Course ${courseId} not found`);
  return course;
}

/**
 * One-paragraph summary of the learner's measured performance on modules
 * before `order`, fed into the module prompt so difficulty adapts. Pure DB
 * aggregation — no LLM call.
 */
export async function computePerformanceSummary(
  course: { modules: Array<{ order: number; title: string; documentId: string | null }> },
  order: number,
  db: PrismaClient = defaultPrisma
): Promise<string | null> {
  const priorDocumentIds = course.modules
    .filter((module) => module.order < order && module.documentId)
    .map((module) => module.documentId!);
  if (priorDocumentIds.length === 0) return null;

  const [scoreAggregate, perModuleScores, weakChunks] = await Promise.all([
    db.attempt.aggregate({
      _avg: { score: true },
      _count: { _all: true },
      where: { chunk: { documentId: { in: priorDocumentIds } } },
    }),
    db.attempt.groupBy({
      by: ["chunkId"],
      _avg: { score: true },
      where: { chunk: { documentId: { in: priorDocumentIds } } },
    }),
    db.chunk.findMany({
      where: { documentId: { in: priorDocumentIds }, quizWrongCount: { gt: 0 } },
      orderBy: { quizWrongCount: "desc" },
      take: 3,
      select: { title: true, quizWrongCount: true },
    }),
  ]);

  if (scoreAggregate._count._all === 0) return null;

  const averageScore = Math.round(scoreAggregate._avg.score ?? 0);
  const lowScores = perModuleScores.filter((row) => (row._avg.score ?? 100) < 70).length;

  const parts = [
    `Across ${priorDocumentIds.length} prior module(s), the learner averaged ${averageScore}/100 over ${scoreAggregate._count._all} recall attempts.`,
  ];
  if (lowScores > 0) {
    parts.push(`${lowScores} section(s) averaged below 70 and needed extra tries — pace new concepts gently.`);
  } else {
    parts.push(`Recall has been solid; the learner can handle a slightly brisker pace.`);
  }
  if (weakChunks.length > 0) {
    parts.push(
      `Quiz answers were missed most on: ${weakChunks.map((chunk) => `"${chunk.title}"`).join(", ")} — briefly reinforce those ideas where they connect to this module.`
    );
  }
  return parts.join(" ");
}

/**
 * Generates a module's content into a Document + Chunks. Idempotent:
 * - already ready/completed → returns the existing document id, no LLM call;
 * - currently generating (this request lost the CAS) → returns null documentId,
 *   caller polls;
 * - unlocked/failed → transitions to generating and runs the pipeline.
 * On any generation failure the reserved credits are refunded and the module
 * is marked failed — visibly retryable, never a silent heuristic fallback.
 */
export async function generateModule(
  courseId: string,
  order: number,
  userId: string,
  db: PrismaClient = defaultPrisma
): Promise<{ status: string; documentId: string | null }> {
  const course = await loadCourseWithModules(courseId, userId, db);
  const target = course.modules.find((entry) => entry.order === order);
  if (!target) throw new ModuleNotFoundError(`Module ${order} not found in course ${courseId}`);

  if (target.status === "ready" || target.status === "completed") {
    return { status: target.status, documentId: target.documentId };
  }
  if (target.status === "generating") {
    return { status: "generating", documentId: null };
  }
  if (target.status === "locked") {
    throw new ModuleStateError("This module is still locked — complete the previous module first.");
  }

  // CAS transition unlocked/failed → generating: the losing side of a
  // concurrent double-click sees count 0 and becomes a polling no-op.
  const { count } = await db.courseModule.updateMany({
    where: { id: target.id, status: { in: ["unlocked", "failed"] } },
    data: { status: "generating" },
  });
  if (count === 0) {
    return { status: "generating", documentId: null };
  }

  const gate = await reserveLlmCall(userId, "coursegen_module", db);
  if (!gate.ok) {
    await db.courseModule.update({ where: { id: target.id }, data: { status: target.status } });
    throwForGate(gate);
  }

  try {
    const input: ModuleGenerationInput = {
      goal: course.goal,
      brief: course.learnerBrief as LearnerBrief,
      courseTitle: course.title,
      syllabus: course.modules.map((entry) => ({ title: entry.title, summary: entry.summary })),
      module: {
        title: target.title,
        summary: target.summary,
        objectives: (target.objectives as string[]) ?? [],
      },
      priorModuleTitles: course.modules.filter((entry) => entry.order < order).map((entry) => entry.title),
      performanceSummary: await computePerformanceSummary(course, order, db),
    };

    const content = await generateCourseModuleContent(input, gate.tier);
    await recordCourseGenUsage(userId, "coursegen_module", gate, db);

    const documentId = await db.$transaction(async (tx) => {
      const document = await tx.document.create({
        data: {
          userId,
          title: target.title,
          sourceType: "generated",
          spaceId: course.spaceId,
          chunks: {
            create: content.sections.map((section, index) => ({
              order: index,
              title: section.title,
              content: section.content,
              wordCount: markdownToWords(section.content).length,
              sectionTitle: section.title,
              keyPoints: section.keyPoints,
            })),
          },
        },
      });
      // The unique CourseModule.documentId plus the generating-status guard
      // makes a double-create impossible: only the CAS winner reaches here.
      await tx.courseModule.update({
        where: { id: target.id },
        data: { status: "ready", documentId: document.id, generatedAt: new Date() },
      });
      return document.id;
    });

    return { status: "ready", documentId };
  } catch (error) {
    await refundLlmCredits(userId, gate.creditsCharged, db);
    await db.courseModule.update({ where: { id: target.id }, data: { status: "failed" } }).catch(() => {});
    throw error;
  }
}

/** All chunks passed at least once + the module quiz completed — the standard
 * mastery gate. "Test out": a completed module quiz at >=80% alone suffices. */
export async function isModuleMastered(
  documentId: string,
  db: PrismaClient = defaultPrisma
): Promise<{ mastered: boolean; reason: string }> {
  const [chunkCount, passedChunks, quizzes] = await Promise.all([
    db.chunk.count({ where: { documentId } }),
    db.attempt.findMany({
      where: { passed: true, chunk: { documentId } },
      distinct: ["chunkId"],
      select: { chunkId: true },
    }),
    db.quiz.findMany({
      where: { documentId, kind: "module", status: "completed" },
      select: { score: true, totalQuestions: true },
    }),
  ]);

  const quizCompleted = quizzes.length > 0;
  const testOut = quizzes.some(
    (quiz) => quiz.totalQuestions > 0 && quiz.score / quiz.totalQuestions >= TEST_OUT_QUIZ_THRESHOLD
  );
  if (testOut) return { mastered: true, reason: "test_out" };

  const allChunksPassed = chunkCount > 0 && passedChunks.length >= chunkCount;
  if (allChunksPassed && quizCompleted) return { mastered: true, reason: "mastered" };

  const missing: string[] = [];
  if (!allChunksPassed) missing.push(`${chunkCount - passedChunks.length} of ${chunkCount} sections not yet passed`);
  if (!quizCompleted) missing.push("module quiz not completed");
  return { mastered: false, reason: missing.join("; ") };
}

/**
 * Marks a mastered module completed and unlocks the next one; completing the
 * last module completes the course. Throws ModuleNotMasteredError with a
 * human-readable reason when the gate isn't met.
 */
export async function completeModule(
  courseId: string,
  order: number,
  userId: string,
  db: PrismaClient = defaultPrisma
): Promise<{ completedOrder: number; unlockedOrder: number | null; courseCompleted: boolean }> {
  const course = await loadCourseWithModules(courseId, userId, db);
  const target = course.modules.find((entry) => entry.order === order);
  if (!target) throw new ModuleNotFoundError(`Module ${order} not found in course ${courseId}`);

  if (target.status === "completed") {
    // Idempotent: re-submitting a completed module just reports current state.
    const next = course.modules.find((entry) => entry.order === order + 1);
    return {
      completedOrder: order,
      unlockedOrder: next && next.status !== "locked" ? next.order : null,
      courseCompleted: course.status === "completed",
    };
  }
  if (target.status !== "ready" || !target.documentId) {
    throw new ModuleStateError("This module has no generated content to complete yet.");
  }

  const mastery = await isModuleMastered(target.documentId, db);
  if (!mastery.mastered) {
    throw new ModuleNotMasteredError(mastery.reason);
  }

  const next = course.modules.find((entry) => entry.order === order + 1);
  await db.$transaction(async (tx) => {
    await tx.courseModule.update({ where: { id: target.id }, data: { status: "completed" } });
    if (next) {
      await tx.courseModule.updateMany({ where: { id: next.id, status: "locked" }, data: { status: "unlocked" } });
    } else {
      await tx.course.update({ where: { id: course.id }, data: { status: "completed" } });
    }
  });

  return { completedOrder: order, unlockedOrder: next?.order ?? null, courseCompleted: !next };
}

/** Course progress as the share of modules completed. */
export function courseProgressPct(modules: Array<{ status: string }>): number {
  if (modules.length === 0) return 0;
  const completed = modules.filter((module) => module.status === "completed").length;
  return Math.round((completed / modules.length) * 100);
}
