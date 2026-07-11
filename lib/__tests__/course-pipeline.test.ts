// Course pipeline state machine: lock → generate → ready → complete → unlock,
// generation idempotency, refund-on-failure, and the quiz test-out gate.
// The LLM layer is mocked (deterministic canned outputs / failures); billing
// runs for real against the isolated test schema with LLM_BACKEND=direct.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { CREDIT_COSTS } from "@/lib/pricing";
import { setupTestDb } from "./test-db";

vi.mock("@/lib/llm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/llm")>();
  return {
    ...actual,
    generateCourseSyllabus: vi.fn(),
    generateCourseModuleContent: vi.fn(),
  };
});

let db: PrismaClient;
let teardown: () => Promise<void>;

beforeAll(async () => {
  ({ db, teardown } = await setupTestDb());
}, 30000);

afterAll(async () => {
  await teardown();
});

beforeEach(() => {
  process.env.LLM_BACKEND = "direct";
});

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.LLM_BACKEND;
});

const SYLLABUS = {
  title: "SQL from Scratch",
  modules: [
    { title: "What a database is", summary: "Tables, rows, columns.", objectives: ["Define a relational table"] },
    { title: "SELECT basics", summary: "Reading data.", objectives: ["Write a SELECT query"] },
    { title: "Joins", summary: "Combining tables.", objectives: ["Apply INNER JOIN"] },
  ],
};

const MODULE_CONTENT = {
  sections: [
    { title: "Tables hold rows", content: "A **table** is a grid of rows and columns. ".repeat(10), keyPoints: ["Tables store rows"] },
    { title: "Columns have types", content: "Every **column** declares a type. ".repeat(10), keyPoints: ["Columns are typed"] },
  ],
};

async function libs() {
  const llm = await import("@/lib/llm");
  const course = await import("@/lib/course");
  return { llm, course };
}

async function seedProUser(userId: string, balance = 100) {
  await db.userPlan.create({ data: { userId, plan: "pro" } });
  await db.userCredits.create({ data: { userId, balance } });
}

async function createTestCourse(userId: string) {
  const { llm, course } = await libs();
  vi.mocked(llm.generateCourseSyllabus).mockResolvedValueOnce(SYLLABUS);
  return course.createCourse(
    userId,
    { goal: "Learn SQL", brief: { level: "beginner", timeBudgetMinutesPerDay: 20, motivation: "career" } },
    db
  );
}

describe("createCourse", () => {
  it("creates the course, its dedicated space, and modules with only the first unlocked", async () => {
    const userId = "user_course_create";
    await seedProUser(userId);

    const created = await createTestCourse(userId);

    expect(created.status).toBe("draft");
    expect(created.modules.map((module) => module.status)).toEqual(["unlocked", "locked", "locked"]);
    const space = await db.space.findUniqueOrThrow({ where: { id: created.spaceId } });
    expect(space.name).toBe("SQL from Scratch");
    const credits = await db.userCredits.findUniqueOrThrow({ where: { userId } });
    expect(credits.balance).toBe(100 - CREDIT_COSTS.coursegen_syllabus);
  });

  it("refunds the syllabus credits when generation fails", async () => {
    const { llm, course } = await libs();
    const userId = "user_course_create_fail";
    await seedProUser(userId);
    vi.mocked(llm.generateCourseSyllabus).mockRejectedValueOnce(new llm.CourseGenParseError("bad json"));

    await expect(
      course.createCourse(
        userId,
        { goal: "Learn SQL", brief: { level: "beginner", timeBudgetMinutesPerDay: 20, motivation: "career" } },
        db
      )
    ).rejects.toBeInstanceOf(llm.CourseGenParseError);

    const credits = await db.userCredits.findUniqueOrThrow({ where: { userId } });
    expect(credits.balance).toBe(100);
    const refund = await db.creditLedger.findFirst({ where: { userId, reason: "refund" } });
    expect(refund?.deltaCredits).toBe(CREDIT_COSTS.coursegen_syllabus);
  });
});

describe("generateModule", () => {
  it("generates an unlocked module into a generated Document with chunks and marks it ready", async () => {
    const { llm, course } = await libs();
    const userId = "user_module_generate";
    await seedProUser(userId);
    const created = await createTestCourse(userId);
    vi.mocked(llm.generateCourseModuleContent).mockResolvedValueOnce(MODULE_CONTENT);

    const result = await course.generateModule(created.id, 0, userId, db);

    expect(result.status).toBe("ready");
    const document = await db.document.findUniqueOrThrow({
      where: { id: result.documentId! },
      include: { chunks: true },
    });
    expect(document.sourceType).toBe("generated");
    expect(document.spaceId).toBe(created.spaceId);
    expect(document.chunks.length).toBe(2);
    const updated = await db.courseModule.findFirstOrThrow({ where: { courseId: created.id, order: 0 } });
    expect(updated.status).toBe("ready");
    expect(updated.documentId).toBe(result.documentId);
  });

  it("is idempotent: a repeat call returns the existing document without another LLM call", async () => {
    const { llm, course } = await libs();
    const userId = "user_module_idempotent";
    await seedProUser(userId);
    const created = await createTestCourse(userId);
    vi.mocked(llm.generateCourseModuleContent).mockResolvedValue(MODULE_CONTENT);

    const first = await course.generateModule(created.id, 0, userId, db);
    const second = await course.generateModule(created.id, 0, userId, db);

    expect(second.documentId).toBe(first.documentId);
    expect(vi.mocked(llm.generateCourseModuleContent)).toHaveBeenCalledTimes(1);
  });

  it("refuses to generate a locked module", async () => {
    const { course } = await libs();
    const userId = "user_module_locked";
    await seedProUser(userId);
    const created = await createTestCourse(userId);

    await expect(course.generateModule(created.id, 1, userId, db)).rejects.toBeInstanceOf(course.ModuleStateError);
  });

  it("marks the module failed and refunds credits when generation fails, then allows retry", async () => {
    const { llm, course } = await libs();
    const userId = "user_module_fail_retry";
    await seedProUser(userId);
    const created = await createTestCourse(userId);
    const balanceAfterSyllabus = 100 - CREDIT_COSTS.coursegen_syllabus;

    vi.mocked(llm.generateCourseModuleContent).mockRejectedValueOnce(new llm.CourseGenParseError("bad json"));
    await expect(course.generateModule(created.id, 0, userId, db)).rejects.toBeInstanceOf(llm.CourseGenParseError);

    const failed = await db.courseModule.findFirstOrThrow({ where: { courseId: created.id, order: 0 } });
    expect(failed.status).toBe("failed");
    const credits = await db.userCredits.findUniqueOrThrow({ where: { userId } });
    expect(credits.balance).toBe(balanceAfterSyllabus);

    // failed → generating is a legal retry transition.
    vi.mocked(llm.generateCourseModuleContent).mockResolvedValueOnce(MODULE_CONTENT);
    const retried = await course.generateModule(created.id, 0, userId, db);
    expect(retried.status).toBe("ready");
  });
});

describe("completeModule", () => {
  async function generateFirstModule(userId: string) {
    const { llm, course } = await libs();
    const created = await createTestCourse(userId);
    vi.mocked(llm.generateCourseModuleContent).mockResolvedValue(MODULE_CONTENT);
    const generated = await course.generateModule(created.id, 0, userId, db);
    return { created, documentId: generated.documentId! };
  }

  async function passAllChunks(userId: string, documentId: string) {
    const chunks = await db.chunk.findMany({ where: { documentId } });
    const session = await db.session.create({ data: { userId, documentId, currentWpm: 250 } });
    for (const chunk of chunks) {
      await db.attempt.create({
        data: { sessionId: session.id, chunkId: chunk.id, summary: "s", score: 90, hint: "", wpmAtAttempt: 250, passed: true },
      });
    }
  }

  async function completeQuiz(userId: string, documentId: string, score: number, total: number) {
    await db.quiz.create({
      data: { userId, kind: "module", documentId, status: "completed", totalQuestions: total, score, completedAt: new Date() },
    });
  }

  it("rejects completion before the mastery gate is met", async () => {
    const { course } = await libs();
    const userId = "user_complete_unmastered";
    await seedProUser(userId);
    const { created } = await generateFirstModule(userId);

    await expect(course.completeModule(created.id, 0, userId, db)).rejects.toBeInstanceOf(
      course.ModuleNotMasteredError
    );
  });

  it("completes a mastered module (all chunks passed + quiz completed) and unlocks the next", async () => {
    const { course } = await libs();
    const userId = "user_complete_mastered";
    await seedProUser(userId);
    const { created, documentId } = await generateFirstModule(userId);
    await passAllChunks(userId, documentId);
    await completeQuiz(userId, documentId, 1, 2); // completed, but below test-out threshold

    const result = await course.completeModule(created.id, 0, userId, db);

    expect(result).toMatchObject({ completedOrder: 0, unlockedOrder: 1, courseCompleted: false });
    const statuses = await db.courseModule.findMany({ where: { courseId: created.id }, orderBy: { order: "asc" } });
    expect(statuses.map((module) => module.status)).toEqual(["completed", "unlocked", "locked"]);
  });

  it("allows testing out with a >=80% module quiz and no reading", async () => {
    const { course } = await libs();
    const userId = "user_complete_testout";
    await seedProUser(userId);
    const { created, documentId } = await generateFirstModule(userId);
    await completeQuiz(userId, documentId, 4, 5); // 80%, no attempts at all

    const result = await course.completeModule(created.id, 0, userId, db);

    expect(result.completedOrder).toBe(0);
    expect(result.unlockedOrder).toBe(1);
  });

  it("completing the final module completes the course", async () => {
    const { llm, course } = await libs();
    const userId = "user_complete_course";
    await seedProUser(userId, 200);
    const { created } = await generateFirstModule(userId);
    vi.mocked(llm.generateCourseModuleContent).mockResolvedValue(MODULE_CONTENT);

    for (let order = 0; order < 3; order += 1) {
      const generated = await course.generateModule(created.id, order, userId, db);
      await completeQuiz(userId, generated.documentId!, 5, 5);
      await course.completeModule(created.id, order, userId, db);
    }

    const finalCourse = await db.course.findUniqueOrThrow({ where: { id: created.id } });
    expect(finalCourse.status).toBe("completed");
  });

  it("is idempotent on an already-completed module", async () => {
    const { course } = await libs();
    const userId = "user_complete_idempotent";
    await seedProUser(userId);
    const { created, documentId } = await generateFirstModule(userId);
    await completeQuiz(userId, documentId, 5, 5);

    await course.completeModule(created.id, 0, userId, db);
    const repeat = await course.completeModule(created.id, 0, userId, db);

    expect(repeat).toMatchObject({ completedOrder: 0, unlockedOrder: 1 });
  });
});
