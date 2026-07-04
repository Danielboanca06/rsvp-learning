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

export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;
export type StartSessionInput = z.infer<typeof startSessionSchema>;
export type SubmitAttemptInput = z.infer<typeof submitAttemptSchema>;
