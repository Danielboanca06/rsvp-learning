// Coursegen output validation: accepts a schema-valid response, repairs a bad
// one with exactly one retry, and fails loudly (CourseGenParseError) instead
// of silently falling back when the repair also fails. Runs against the
// Ollama backend shape with fetch mocked — no network, no keys.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CourseGenParseError,
  generateCourseModuleContent,
  generateCourseSyllabus,
} from "@/lib/llm";
import type { LearnerBrief } from "@/lib/validation";

const BRIEF: LearnerBrief = { level: "beginner", timeBudgetMinutesPerDay: 20, motivation: "curiosity" };

const VALID_SYLLABUS = {
  title: "Music Theory Basics",
  modules: Array.from({ length: 6 }, (_, index) => ({
    title: `Module ${index + 1}`,
    summary: "A focused topic in the progression.",
    objectives: ["Explain the core idea", "Apply it to an example"],
  })),
};

const VALID_MODULE = {
  sections: Array.from({ length: 4 }, (_, index) => ({
    title: `Section ${index + 1}`,
    content: "This is substantial teaching prose that easily clears the minimum content length required. ".repeat(3),
    keyPoints: ["One recallable fact", "Another recallable fact"],
  })),
};

const MODULE_INPUT = {
  goal: "Learn music theory",
  brief: BRIEF,
  courseTitle: VALID_SYLLABUS.title,
  syllabus: VALID_SYLLABUS.modules.map((module) => ({ title: module.title, summary: module.summary })),
  module: VALID_SYLLABUS.modules[0],
  priorModuleTitles: [],
};

/** Mocks the Ollama backend: /api/tags resolves a model, /api/generate pops
 * the next canned completion off the queue. */
function mockOllama(generateResponses: string[]) {
  const generateCalls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const href = String(url);
      if (href.endsWith("/api/tags")) {
        return new Response(JSON.stringify({ models: [{ name: "test-model" }] }));
      }
      if (href.endsWith("/api/generate")) {
        generateCalls.push(String(init?.body ?? ""));
        const next = generateResponses.shift() ?? "";
        return new Response(JSON.stringify({ response: next }));
      }
      throw new Error(`Unexpected fetch: ${href}`);
    })
  );
  return generateCalls;
}

beforeEach(() => {
  delete process.env.LLM_BACKEND; // default "ollama" path
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("generateCourseSyllabus parsing", () => {
  it("returns a schema-valid syllabus on the first try", async () => {
    const calls = mockOllama([JSON.stringify(VALID_SYLLABUS)]);

    const syllabus = await generateCourseSyllabus("Learn music theory", BRIEF);

    expect(syllabus.title).toBe("Music Theory Basics");
    expect(syllabus.modules.length).toBe(6);
    expect(calls.length).toBe(1);
  });

  it("repairs an invalid response with exactly one retry", async () => {
    const calls = mockOllama([
      JSON.stringify({ title: "Missing modules entirely" }),
      JSON.stringify(VALID_SYLLABUS),
    ]);

    const syllabus = await generateCourseSyllabus("Learn music theory", BRIEF);

    expect(syllabus.modules.length).toBe(6);
    expect(calls.length).toBe(2);
    // The second call is the repair prompt: it must carry the validation
    // failure and the previous bad response back to the model.
    expect(calls[1]).toContain("failed validation");
    expect(calls[1]).toContain("Missing modules entirely");
  });

  it("throws CourseGenParseError when the repair also fails — never a silent fallback", async () => {
    const calls = mockOllama(["not json at all", JSON.stringify({ modules: "wrong shape" })]);

    await expect(generateCourseSyllabus("Learn music theory", BRIEF)).rejects.toBeInstanceOf(CourseGenParseError);
    expect(calls.length).toBe(2);
  });
});

describe("generateCourseModuleContent parsing", () => {
  it("returns schema-valid sections", async () => {
    mockOllama([JSON.stringify(VALID_MODULE)]);

    const content = await generateCourseModuleContent(MODULE_INPUT);

    expect(content.sections.length).toBe(4);
    expect(content.sections[0].keyPoints.length).toBeGreaterThan(0);
  });

  it("throws CourseGenParseError after a failed repair", async () => {
    mockOllama([JSON.stringify({ sections: [] }), JSON.stringify({ sections: [] })]);

    await expect(generateCourseModuleContent(MODULE_INPUT)).rejects.toBeInstanceOf(CourseGenParseError);
  });
});
