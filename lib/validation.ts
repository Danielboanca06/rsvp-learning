import { z } from "zod";

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
  kind: z.enum(["subscription", "topup_small", "topup_large"]),
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
