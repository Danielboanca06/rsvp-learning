// Transport layer for all LLM calls in the app. Two backends:
// - "ollama": local Ollama instance, free, used for local dev / offline fallback.
// - "direct": calls each provider's own API directly, with an in-process fallback
//   loop across a small hardcoded pool of free-tier + paid providers. Replaced a
//   self-hosted LiteLLM proxy — that added a whole separate stateful service (with
//   its own Postgres, virtual keys, budget tracking) to solve per-user metering we
//   already handle ourselves in lib/llm-quota.ts, and its baseline Python/Prisma
//   memory footprint (~800MB+ just importing its built-in model-cost registry)
//   didn't fit a 1GB container. For our fixed set of 5 providers, a thin adapter
//   per provider plus our own retry loop is simpler and needs no extra hosting.
// Selected via LLM_BACKEND. This module knows nothing about users or billing —
// it only needs a task (which prompt/model group) and a tier (free vs paid routing).
// Per-user quota/credit gating and usage recording live in lib/llm-quota.ts, one layer up.

import { markdownToWords } from "@/lib/markdown";

const LLM_BACKEND = process.env.LLM_BACKEND ?? "ollama";

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
const FALLBACK_MODEL = "llama3";

// Per-hop timeouts, not total-request timeouts — the fallback loop below tries
// multiple providers per call, so these are sized so worst-case (every hop times
// out) still fits Vercel's function duration cap (180s w/ Fluid Compute for
// chunking's route, default 60s for the others).
const CHUNKING_HOP_TIMEOUT_MS = 45000; // up to 3 hops: 135s worst case
const GRADING_QUIZGEN_HOP_TIMEOUT_MS = 15000; // up to 3 hops: 45s worst case

export type Task = "chunking" | "grading" | "quizgen";
export type Tier = "free" | "paid";

export type SemanticChunk = {
  title: string;
  content: string;
  // Parent section this sub-module belongs to; null when the source is short
  // enough that a topic never needed splitting (or on fallback paths).
  sectionTitle: string | null;
  // 3-5 pre-generated one-idea recall anchors, empty on fallback paths.
  keyPoints: string[];
};

export type GradingResult = {
  score: number;
  hint: string;
  socraticQuestion: string | null;
};

export type RecallGradingResult = {
  score: number;
  correct: boolean;
  feedback: string;
};

export type QuizQuestionResult = {
  question: string;
  options: string[];
  correctIndex: number;
};

// Thrown when the LiteLLM gateway itself reports failure across its whole fallback
// chain for a task/tier (distinct from a per-user quota block, which never reaches
// this module — see lib/llm-quota.ts). Callers currently still fall back to the
// local heuristics below; this type exists so that safety net can be told apart
// from "the model just returned junk JSON" in logs/telemetry.
export class LlmGatewayUnavailableError extends Error {}

export async function resolveOllamaModel(): Promise<string> {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    const data = await res.json();
    if (data.models && data.models.length > 0) {
      return data.models[0].name;
    }
  } catch {
    // Ollama not reachable for tag discovery, fall through to default
  }
  return FALLBACK_MODEL;
}

async function generateJSONViaOllama(prompt: string, timeoutMs: number): Promise<string> {
  const model = await resolveOllamaModel();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        format: "json",
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new LlmGatewayUnavailableError(`Ollama responded with status ${response.status}`);
    }

    const data = await response.json();
    return data.response as string;
  } finally {
    clearTimeout(timeout);
  }
}

// --- Direct multi-provider client ---
// Model IDs verified live against each provider's actual catalog on 2026-07-05
// (same verification pass as the retired LiteLLM config) — re-check before
// trusting these long-term, free-tier catalogs especially churn often.

export type Provider = "openrouter" | "gemini" | "groq" | "cerebras" | "anthropic";

type ModelEntry = { provider: Provider; model: string };

const MODEL_GROUPS: Record<string, ModelEntry[]> = {
  // Chunking: needs large context + must preserve source wording exactly.
  "chunking-free": [
    { provider: "openrouter", model: "meta-llama/llama-3.3-70b-instruct:free" },
    { provider: "openrouter", model: "qwen/qwen3-next-80b-a3b-instruct:free" },
    { provider: "gemini", model: "gemini-2.5-flash" },
  ],
  "chunking-paid": [{ provider: "anthropic", model: "claude-haiku-4-5-20251001" }],

  // Grading: latency-sensitive + quality-critical (this app's core trust surface).
  "grading-free": [
    { provider: "groq", model: "llama-3.3-70b-versatile" },
    { provider: "cerebras", model: "gpt-oss-120b" },
  ],
  "grading-paid": [{ provider: "anthropic", model: "claude-haiku-4-5-20251001" }],

  // Quiz generation.
  "quizgen-free": [
    { provider: "openrouter", model: "meta-llama/llama-3.3-70b-instruct:free" },
    { provider: "groq", model: "llama-3.3-70b-versatile" },
    { provider: "openrouter", model: "openai/gpt-oss-120b:free" },
  ],
  "quizgen-paid": [{ provider: "anthropic", model: "claude-haiku-4-5-20251001" }],
};

export function envKeyForProvider(provider: Provider): string | undefined {
  switch (provider) {
    case "openrouter":
      return process.env.OPENROUTER_API_KEY;
    case "gemini":
      return process.env.GEMINI_API_KEY;
    case "groq":
      return process.env.GROQ_API_KEY;
    case "cerebras":
      return process.env.CEREBRAS_API_KEY;
    case "anthropic":
      return process.env.ANTHROPIC_API_KEY;
  }
}

async function callOpenAICompatible(
  baseUrl: string,
  apiKey: string,
  model: string,
  prompt: string,
  timeoutMs: number
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new LlmGatewayUnavailableError(`${baseUrl} responded with status ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new LlmGatewayUnavailableError(`${baseUrl} response had no message content`);
    }
    return content;
  } finally {
    clearTimeout(timeout);
  }
}

async function callGemini(apiKey: string, model: string, prompt: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" },
        }),
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      throw new LlmGatewayUnavailableError(`Gemini responded with status ${response.status}`);
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof content !== "string") {
      throw new LlmGatewayUnavailableError("Gemini response had no content");
    }
    return content;
  } finally {
    clearTimeout(timeout);
  }
}

async function callAnthropic(apiKey: string, model: string, prompt: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new LlmGatewayUnavailableError(`Anthropic responded with status ${response.status}`);
    }

    const data = await response.json();
    const content = data.content?.[0]?.text;
    if (typeof content !== "string") {
      throw new LlmGatewayUnavailableError("Anthropic response had no content");
    }
    return content;
  } finally {
    clearTimeout(timeout);
  }
}

async function callProvider(entry: ModelEntry, apiKey: string, prompt: string, timeoutMs: number): Promise<string> {
  switch (entry.provider) {
    case "openrouter":
      return callOpenAICompatible("https://openrouter.ai/api/v1", apiKey, entry.model, prompt, timeoutMs);
    case "groq":
      return callOpenAICompatible("https://api.groq.com/openai/v1", apiKey, entry.model, prompt, timeoutMs);
    case "cerebras":
      return callOpenAICompatible("https://api.cerebras.ai/v1", apiKey, entry.model, prompt, timeoutMs);
    case "gemini":
      return callGemini(apiKey, entry.model, prompt, timeoutMs);
    case "anthropic":
      return callAnthropic(apiKey, entry.model, prompt, timeoutMs);
  }
}

// Tries each configured provider in order for the task/tier group, falling over
// to the next on any failure (rate limit, timeout, transient 5xx). Mirrors what
// the retired LiteLLM proxy did, scoped to just the 5 providers we actually use.
async function generateJSONDirect(prompt: string, perHopTimeoutMs: number, task: Task, tier: Tier): Promise<string> {
  const entries = MODEL_GROUPS[`${task}-${tier}`] ?? [];
  let lastError: unknown;

  for (const entry of entries) {
    const apiKey = envKeyForProvider(entry.provider);
    if (!apiKey) continue; // no key configured for this provider — skip, don't fail the whole request

    try {
      return await callProvider(entry, apiKey, prompt, perHopTimeoutMs);
    } catch (error) {
      lastError = error;
    }
  }

  const reason = lastError instanceof Error ? lastError.message : String(lastError);
  throw new LlmGatewayUnavailableError(`All providers failed for ${task}-${tier}${lastError ? `: ${reason}` : ""}`);
}

async function generateJSON(prompt: string, perHopTimeoutMs: number, task: Task, tier: Tier): Promise<string> {
  if (LLM_BACKEND === "direct") {
    return generateJSONDirect(prompt, perHopTimeoutMs, task, tier);
  }
  return generateJSONViaOllama(prompt, perHopTimeoutMs);
}

function extractJsonObject(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }
    throw new Error("Model response did not contain valid JSON");
  }
}

type RawModule = { title?: unknown; content?: unknown; keyPoints?: unknown };

// Normalizes the chunking response into flat modules tagged with their parent
// section title. Prefers the two-level {sections: [{title, modules}]} shape the
// prompt asks for, but tolerates the legacy flat shapes ({modules}, {chunks},
// bare array) that weaker free-tier models still fall back to.
function extractModules(raw: string): Array<{ sectionTitle: string | null; module: RawModule }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const match = raw.match(/[\[{][\s\S]*[\]}]/);
    if (!match) throw new Error("Model response did not contain valid JSON");
    parsed = JSON.parse(match[0]);
  }

  const root = parsed as { sections?: unknown; modules?: unknown; chunks?: unknown };
  if (root && Array.isArray(root.sections)) {
    return root.sections.flatMap((section: { title?: unknown; modules?: unknown }) => {
      const sectionTitle = typeof section?.title === "string" && section.title.trim() ? section.title.trim() : null;
      const modules = Array.isArray(section?.modules) ? (section.modules as RawModule[]) : [];
      return modules.map((module) => ({ sectionTitle, module }));
    });
  }

  const flat = Array.isArray(parsed)
    ? (parsed as RawModule[])
    : Array.isArray(root?.modules)
      ? (root.modules as RawModule[])
      : Array.isArray(root?.chunks)
        ? (root.chunks as RawModule[])
        : null;
  if (!flat) throw new Error("Parsed JSON did not contain sections or modules");
  return flat.map((module) => ({ sectionTitle: null, module }));
}

function countWords(text: string): number {
  // Module content may carry light markdown; size decisions should count the
  // words the reader actually reads, not the formatting markers.
  return markdownToWords(text).length;
}

function splitIntoSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

// Safety net for when the model ignores the size guidance: any module too big
// to recall in one sitting gets split locally at sentence boundaries into
// digestible parts. Returns [content] unchanged when the module is fine.
const MODULE_MAX_WORDS = 220;
const MODULE_SPLIT_TARGET_WORDS = 120;

function splitOversizedContent(content: string): string[] {
  if (countWords(content) <= MODULE_MAX_WORDS) return [content];

  const sentences = splitIntoSentences(content);
  if (sentences.length <= 1) return [content];

  const parts: string[] = [];
  let buffer = "";
  for (const sentence of sentences) {
    const candidate = buffer ? `${buffer} ${sentence}` : sentence;
    if (buffer && countWords(candidate) > MODULE_SPLIT_TARGET_WORDS) {
      parts.push(buffer);
      buffer = sentence;
    } else {
      buffer = candidate;
    }
  }
  if (buffer) parts.push(buffer);
  return parts;
}

function buildChunkingPrompt(text: string): string {
  return `You are an instructional designer breaking a document into a "Learning Path" for a speed-reading and active-recall app. After each module the reader must recall it from memory unaided, so every module has to be small enough to digest and recall in one sitting.

Segment the text below in two levels:
1. "sections": the document's major topics, in reading order. A section is where the subject matter genuinely shifts.
2. Within each section, "modules": the actual learning units. Each module must cover exactly ONE self-contained idea, carry about 3-5 key points (never more), and be roughly 40-180 words. When a section is too large to recall at once, split it into several sequential modules at the natural seams between ideas — but do NOT fragment a single tight idea across modules just to hit a word count; a module must still make sense read on its own. Short documents may end up as one section with a few modules; that is fine.

Do NOT just split on paragraph breaks — group related sentences together and split where the ideas actually shift. Preserve the original wording of the text exactly inside each module's "content" (do not paraphrase, summarize, or omit sentences); every part of the source text must appear in exactly one module, and sections and modules must appear in the same order as the source.

Format each module's "content" as lightly-structured Markdown, without ever changing the words themselves: keep paragraph breaks (blank line between paragraphs), wrap the 1-3 most important key terms of the module in **bold**, and if (and only if) the source text genuinely enumerates items, format them as a Markdown list. Be conservative — most modules should just be one or two plain paragraphs with a couple of bolded terms. Never add headings, never add text that isn't in the source, never bold whole sentences.

Return strictly a JSON object with one key, "sections": an array of objects, each with exactly two keys:
- "title": a short (2-6 word) title for the section's topic.
- "modules": an array of objects in reading order, each with exactly three keys:
  - "title": a short (3-8 word) descriptive title for the module's single idea.
  - "content": the exact original text belonging to that module.
  - "keyPoints": an array of 3-5 short sentences, in the order they appear in the module. Each key point states exactly ONE idea in plain language — these are the facts the reader should be able to recall afterwards.

Text:
${text}`;
}

function buildGradingPrompt(original: string, summary: string): string {
  return `You are evaluating whether a reader understood a text they just read. Compare the MEANING and INTENT of their summary to the original text.

Grading rules:
- Judge semantic meaning only, NOT wording. Paraphrasing, different vocabulary, informal language, and typos are all fine.
- If the summary captures the overall meaning and main point of the text, score it 80 or above, even if minor details are missing.
- Only score below 80 if a core idea is missing, or the summary contradicts or misunderstands the text.

Return strictly a JSON object with exactly three keys:
- "score": an integer from 0 to 100.
- "hint": a few short sentences. If the score is below 80, point the reader toward the topic or part of the text their summary missed or got wrong, WITHOUT revealing the actual fact or answer. If the score is 80 or above, briefly explain what the reader captured correctly, and then correct any phrasing or details in their summary that were even slightly off, imprecise, or subtly different in meaning from the original text — quote their wording and give the accurate version. Only if the summary is essentially flawless, just affirm it with no critique.
- "socraticQuestion": if the score is below 80, a single short guiding question that helps the reader realize on their own what they missed, WITHOUT revealing the answer (for example: "What does the text say happened right before the outcome changed?"). If the score is 80 or above, this must be an empty string.

Original text: ${original}
Reader's summary: ${summary}`;
}

function buildRecallGradingPrompt(word: string, actualDefinition: string, userDefinition: string): string {
  return `You are checking whether a reader correctly recalled the meaning of a vocabulary word.

Grading rules:
- Judge semantic meaning only, NOT exact wording. Paraphrasing, informal language, and typos are fine.
- If the reader's definition captures the core meaning of the word, score it 70 or above.
- Only score below 70 if the reader's definition is missing the core meaning, or describes a different word/meaning entirely.

Return strictly a JSON object with exactly two keys:
- "score": an integer from 0 to 100.
- "feedback": one short sentence. If the score is 70 or above, briefly affirm what they got right. If below 70, briefly and gently explain what the definition actually means, without being harsh.

Word: ${word}
Correct definition: ${actualDefinition}
Reader's definition: ${userDefinition}`;
}

function buildQuizQuestionPrompt(content: string): string {
  return `You are writing a single multiple-choice quiz question to test whether a reader understood and can recall the text below.

Rules:
- Write exactly ONE question testing a specific fact, concept, or detail from the text (not a vague "what is this about" question).
- Provide exactly 4 answer options. Exactly one must be correct according to the text; the other three must be plausible but clearly incorrect to someone who read and understood the text.
- Keep the question and each option concise (one sentence or short phrase each).

Return strictly a JSON object with exactly three keys:
- "question": the question text.
- "options": an array of exactly 4 strings, the answer choices in a random, non-obvious order.
- "correctIndex": an integer 0-3, the index into "options" of the correct answer.

Text:
${content}`;
}

function fallbackQuizQuestion(content: string): QuizQuestionResult {
  const firstSentence = content.split(/(?<=[.!?])\s+/)[0]?.trim() || content.trim();

  return {
    question: `Which of the following best matches the content of this module?`,
    options: [
      firstSentence.length > 140 ? `${firstSentence.slice(0, 140)}...` : firstSentence,
      "The text primarily discusses an unrelated historical event.",
      "The text is a list of unrelated numeric data with no narrative.",
      "The text contains no factual claims.",
    ],
    correctIndex: 0,
  };
}

function fallbackChunks(text: string): SemanticChunk[] {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  // Oversized paragraphs get broken at sentence boundaries first, so a wall of
  // text without paragraph breaks still ends up in recallable pieces.
  const source = (paragraphs.length > 0 ? paragraphs : [text.trim()]).flatMap(splitOversizedContent);
  const groups: string[] = [];
  let buffer = "";

  for (const piece of source) {
    const candidate = buffer ? `${buffer}\n\n${piece}` : piece;
    if (buffer && countWords(candidate) > MODULE_MAX_WORDS) {
      groups.push(buffer);
      buffer = piece;
    } else {
      buffer = candidate;
    }
  }
  if (buffer) groups.push(buffer);

  return groups.map((content, index) => ({
    title: `Module ${index + 1}`,
    content,
    sectionTitle: null,
    keyPoints: [],
  }));
}

function parseKeyPoints(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((point): point is string => typeof point === "string" && point.trim().length > 0)
    .map((point) => point.trim())
    .slice(0, 5);
}

export async function chunkDocument(text: string, tier: Tier = "free"): Promise<SemanticChunk[]> {
  try {
    const raw = await generateJSON(buildChunkingPrompt(text), CHUNKING_HOP_TIMEOUT_MS, "chunking", tier);
    const chunks = extractModules(raw)
      .filter(({ module }) => typeof module.content === "string" && module.content.trim().length > 0)
      .flatMap(({ sectionTitle, module }, index) => {
        const title =
          typeof module.title === "string" && module.title.trim() ? module.title.trim() : `Module ${index + 1}`;
        const keyPoints = parseKeyPoints(module.keyPoints);
        const parts = splitOversizedContent((module.content as string).trim());

        if (parts.length === 1) {
          return [{ title, content: parts[0], sectionTitle, keyPoints }];
        }
        // Module came back too big to recall at once and was split locally: the
        // module title becomes the grouping and the key points can no longer be
        // attributed to a single part, so they're dropped.
        return parts.map((content, partIndex) => ({
          title: `${title} · Part ${partIndex + 1}`,
          content,
          sectionTitle: sectionTitle ?? title,
          keyPoints: [],
        }));
      });

    if (chunks.length === 0) {
      throw new Error("Model returned no usable chunks");
    }
    return chunks;
  } catch {
    return fallbackChunks(text);
  }
}

export async function gradeWordRecall(
  word: string,
  actualDefinition: string,
  userDefinition: string,
  tier: Tier = "free"
): Promise<RecallGradingResult> {
  try {
    const raw = await generateJSON(
      buildRecallGradingPrompt(word, actualDefinition, userDefinition),
      GRADING_QUIZGEN_HOP_TIMEOUT_MS,
      "grading",
      tier
    );
    const parsed = extractJsonObject(raw) as { score?: unknown; feedback?: unknown };

    const score = typeof parsed.score === "number" ? parsed.score : Number(parsed.score) || 0;
    const clampedScore = Math.max(0, Math.min(100, Math.round(score)));
    const feedback = typeof parsed.feedback === "string" ? parsed.feedback : "";

    return {
      score: clampedScore,
      correct: clampedScore >= 70,
      feedback,
    };
  } catch {
    return {
      score: 0,
      correct: false,
      feedback: "Could not reach the AI grader right now. Please try again in a moment.",
    };
  }
}

export async function generateQuizQuestion(content: string, tier: Tier = "free"): Promise<QuizQuestionResult> {
  try {
    const raw = await generateJSON(buildQuizQuestionPrompt(content), GRADING_QUIZGEN_HOP_TIMEOUT_MS, "quizgen", tier);
    const parsed = extractJsonObject(raw) as {
      question?: unknown;
      options?: unknown;
      correctIndex?: unknown;
    };

    const question = typeof parsed.question === "string" ? parsed.question.trim() : "";
    const options = Array.isArray(parsed.options)
      ? parsed.options.filter((option): option is string => typeof option === "string" && option.trim().length > 0)
      : [];
    const correctIndex = typeof parsed.correctIndex === "number" ? parsed.correctIndex : Number(parsed.correctIndex);

    if (!question || options.length !== 4 || !Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) {
      throw new Error("Model returned an unusable quiz question");
    }

    return { question, options, correctIndex };
  } catch {
    return fallbackQuizQuestion(content);
  }
}

export async function gradeSummary(original: string, summary: string, tier: Tier = "free"): Promise<GradingResult> {
  try {
    const raw = await generateJSON(buildGradingPrompt(original, summary), GRADING_QUIZGEN_HOP_TIMEOUT_MS, "grading", tier);
    const parsed = extractJsonObject(raw) as {
      score?: unknown;
      hint?: unknown;
      socraticQuestion?: unknown;
    };

    const score = typeof parsed.score === "number" ? parsed.score : Number(parsed.score) || 0;
    const hint = typeof parsed.hint === "string" ? parsed.hint : "";
    const socraticQuestion =
      typeof parsed.socraticQuestion === "string" && parsed.socraticQuestion.trim().length > 0
        ? parsed.socraticQuestion.trim()
        : null;

    return {
      score: Math.max(0, Math.min(100, Math.round(score))),
      hint,
      socraticQuestion,
    };
  } catch {
    return {
      score: 0,
      hint: "Could not reach the AI grader right now. Please try again in a moment.",
      socraticQuestion: null,
    };
  }
}
