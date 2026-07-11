import { z } from "zod";
import { MIN_WPM, MAX_WPM } from "@/lib/wpm";

export const createDocumentSchema = z.object({
  title: z.string().trim().min(1).max(200),
  text: z.string().trim().min(1),
});

export const startSessionSchema = z.object({
  documentId: z.string().min(1),
});

export const submitAttemptSchema = z.object({
  chunkId: z.string().min(1),
  summary: z.string().trim().min(1),
});

export const defineWordSchema = z.object({
  word: z.string().trim().min(1).max(100),
});

export const addVocabularySchema = z.object({
  word: z.string().trim().min(1).max(100),
  definition: z.string().trim().min(1).max(2000),
  documentId: z.string().min(1).optional(),
  chunkId: z.string().min(1).optional(),
});

export const recallSubmitSchema = z.object({
  definition: z.string().trim().min(1).max(2000),
});

export const createModuleQuizSchema = z.object({
  chunkId: z.string().min(1),
});

export const submitQuizAnswerSchema = z.object({
  quizItemId: z.string().min(1),
  selectedIndex: z.number().int().min(0).max(3),
});

export const createSpaceSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

export const createCheckoutSchema = z.object({
  kind: z.enum(["subscription", "subscription_annual", "topup_small", "topup_large"]),
});

export const updateSessionWpmSchema = z.object({
  currentWpm: z.number().int().min(MIN_WPM).max(MAX_WPM),
});

// --- AI course generation ---

export const learnerBriefSchema = z.object({
  level: z.enum(["beginner", "intermediate", "advanced"]),
  timeBudgetMinutesPerDay: z.number().int().min(5).max(240),
  motivation: z.string().trim().min(1).max(1000),
  interests: z.string().trim().max(1000).optional(),
});

export const createCourseSchema = z.object({
  goal: z.string().trim().min(3).max(2000),
  brief: learnerBriefSchema,
});

export const updateCourseSchema = z.object({
  status: z.enum(["active", "archived"]).optional(),
  // Draft-only syllabus edits: the full desired module list in order. Modules
  // keep their id when renamed/reordered; omitted ids are deleted.
  modules: z
    .array(
      z.object({
        id: z.string().min(1),
        title: z.string().trim().min(1).max(200),
      })
    )
    .min(1)
    .max(20)
    .optional(),
});

// LLM output shapes for the two coursegen tasks. Bounds are slightly looser
// than what the prompts ask for (6-12 modules, 4-8 sections) so a usable
// response one off the target doesn't burn a repair retry or fail the module.
export const courseSyllabusOutputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  modules: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(200),
        summary: z.string().trim().min(1).max(1000),
        objectives: z.array(z.string().trim().min(1).max(300)).min(1).max(8),
      })
    )
    .min(4)
    .max(14),
});

export const courseModuleOutputSchema = z.object({
  sections: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(200),
        content: z.string().trim().min(50),
        keyPoints: z.array(z.string().trim().min(1).max(300)).min(1).max(6),
      })
    )
    .min(2)
    .max(10),
});

export const createChatThreadSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.enum(["selection", "practice"]),
    documentId: z.string().min(1),
    chunkId: z.string().min(1),
    selectionText: z.string().trim().min(1).max(2000),
    parentThreadId: z.string().min(1).optional(),
  }),
  // Module tutor: one persistent thread per generated course module, anchored
  // to the module's document only (no selection).
  z.object({
    kind: z.literal("module"),
    documentId: z.string().min(1),
  }),
]);

export const sendChatMessageSchema = z.object({
  content: z.string().trim().min(1).max(4000),
});

export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;
export type StartSessionInput = z.infer<typeof startSessionSchema>;
export type SubmitAttemptInput = z.infer<typeof submitAttemptSchema>;
export type DefineWordInput = z.infer<typeof defineWordSchema>;
export type AddVocabularyInput = z.infer<typeof addVocabularySchema>;
export type RecallSubmitInput = z.infer<typeof recallSubmitSchema>;
export type CreateModuleQuizInput = z.infer<typeof createModuleQuizSchema>;
export type SubmitQuizAnswerInput = z.infer<typeof submitQuizAnswerSchema>;
export type CreateSpaceInput = z.infer<typeof createSpaceSchema>;
export type CreateCheckoutInput = z.infer<typeof createCheckoutSchema>;
export type UpdateSessionWpmInput = z.infer<typeof updateSessionWpmSchema>;
export type LearnerBrief = z.infer<typeof learnerBriefSchema>;
export type CreateCourseInput = z.infer<typeof createCourseSchema>;
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;
export type CourseSyllabusOutput = z.infer<typeof courseSyllabusOutputSchema>;
export type CourseModuleOutput = z.infer<typeof courseModuleOutputSchema>;
