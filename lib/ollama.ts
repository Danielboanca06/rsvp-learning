const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
const FALLBACK_MODEL = "llama3";

export type SemanticChunk = {
  title: string;
  content: string;
};

export type GradingResult = {
  score: number;
  hint: string;
  socraticQuestion: string | null;
};

async function resolveModel(): Promise<string> {
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

async function generateJSON(prompt: string, timeoutMs: number): Promise<string> {
  const model = await resolveModel();
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
      throw new Error(`Ollama responded with status ${response.status}`);
    }

    const data = await response.json();
    return data.response as string;
  } finally {
    clearTimeout(timeout);
  }
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

function extractJsonArray(raw: string): unknown {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed.modules)) return parsed.modules;
    if (Array.isArray(parsed.chunks)) return parsed.chunks;
    throw new Error("Parsed JSON did not contain a chunk array");
  } catch {
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) {
      return JSON.parse(match[0]);
    }
    throw new Error("Model response did not contain a valid JSON array");
  }
}

function buildChunkingPrompt(text: string): string {
  return `You are an instructional designer breaking a document into a "Learning Path" for a speed-reading and active-recall app.

Segment the text below into an ordered list of semantically coherent modules. Each module should cover ONE self-contained idea or concept, be a natural stopping point for a reader to pause and summarize, and be roughly 80-300 words. Do NOT just split on paragraph breaks — group related sentences/paragraphs together and split where the topic actually shifts. Preserve the original wording of the text exactly inside each module's "content" (do not paraphrase, summarize, or omit sentences); every part of the source text must appear in exactly one module and modules must appear in the same order as the source.

Return strictly a JSON object with one key, "modules", an array of objects in reading order, each with exactly two keys:
- "title": a short (3-8 word) descriptive title for the module.
- "content": the exact original text belonging to that module.

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

function fallbackChunks(text: string): SemanticChunk[] {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const source = paragraphs.length > 0 ? paragraphs : [text.trim()];
  const groups: string[] = [];
  let buffer = "";

  for (const paragraph of source) {
    const candidate = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
    if (candidate.split(/\s+/).length > 250 && buffer) {
      groups.push(buffer);
      buffer = paragraph;
    } else {
      buffer = candidate;
    }
  }
  if (buffer) groups.push(buffer);

  return groups.map((content, index) => ({
    title: `Module ${index + 1}`,
    content,
  }));
}

export async function chunkDocument(text: string): Promise<SemanticChunk[]> {
  try {
    const raw = await generateJSON(buildChunkingPrompt(text), 180000);
    const parsed = extractJsonArray(raw) as Array<{ title?: unknown; content?: unknown }>;
    const chunks = parsed
      .filter((item) => typeof item.content === "string" && item.content.trim().length > 0)
      .map((item, index) => ({
        title: typeof item.title === "string" && item.title.trim() ? item.title.trim() : `Module ${index + 1}`,
        content: (item.content as string).trim(),
      }));

    if (chunks.length === 0) {
      throw new Error("Model returned no usable chunks");
    }
    return chunks;
  } catch {
    return fallbackChunks(text);
  }
}

export async function gradeSummary(original: string, summary: string): Promise<GradingResult> {
  try {
    const raw = await generateJSON(buildGradingPrompt(original, summary), 60000);
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
      hint: "Could not reach the local LLM to grade this summary. Make sure Ollama is running and try again.",
      socraticQuestion: null,
    };
  }
}
