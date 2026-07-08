// Streaming chat transport for the AI chat platform. Sibling of lib/llm.ts
// (which stays JSON-in/JSON-out for chunking/grading/quizgen): chat needs
// token streaming and multi-turn message history, so it gets its own entry
// point instead of contorting generateJSON. Same conventions as lib/llm.ts:
// backend picked by LLM_BACKEND ("ollama" locally, "direct" in prod), a
// per-task/tier provider pool with in-order fallback, and no knowledge of
// users or billing — quota gating lives in lib/llm-quota.ts.

import {
  LlmGatewayUnavailableError,
  envKeyForProvider,
  resolveOllamaModel,
  type Provider,
  type Tier,
} from "@/lib/llm";

const LLM_BACKEND = process.env.LLM_BACKEND ?? "ollama";
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";

// Time allowed to connect and receive the first token from one provider before
// falling over to the next. Once tokens are flowing we stop policing: the
// route's platform duration cap bounds the worst case.
const FIRST_TOKEN_TIMEOUT_MS = 20000;

const MAX_OUTPUT_TOKENS = 1024;

export type ChatCompletionMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ChatModelEntry = { provider: Provider; model: string };

// Chat needs conversational quality + low first-token latency (it's a live
// tutoring surface). Gemini is omitted: it would be a third streaming wire
// format for a provider already reachable through OpenRouter.
const CHAT_MODEL_GROUPS: Record<string, ChatModelEntry[]> = {
  "chat-free": [
    { provider: "groq", model: "llama-3.3-70b-versatile" },
    { provider: "openrouter", model: "meta-llama/llama-3.3-70b-instruct:free" },
    { provider: "cerebras", model: "gpt-oss-120b" },
  ],
  "chat-paid": [{ provider: "anthropic", model: "claude-haiku-4-5-20251001" }],
};

/** Reads an SSE body, yielding the payload of each `data:` line. */
async function* sseDataLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (line.startsWith("data:")) {
          yield line.slice(5).trim();
        }
        newlineIndex = buffer.indexOf("\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
}

async function openStream(
  url: string,
  init: RequestInit,
  label: string
): Promise<ReadableStream<Uint8Array>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FIRST_TOKEN_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
  clearTimeout(timeout);

  if (!response.ok || !response.body) {
    throw new LlmGatewayUnavailableError(`${label} responded with status ${response.status}`);
  }
  return response.body;
}

async function* streamOpenAICompatible(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: ChatCompletionMessage[]
): AsyncGenerator<string> {
  const body = await openStream(
    `${baseUrl}/chat/completions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, stream: true, max_tokens: MAX_OUTPUT_TOKENS }),
    },
    baseUrl
  );

  for await (const payload of sseDataLines(body)) {
    if (payload === "[DONE]") return;
    try {
      const parsed = JSON.parse(payload);
      const delta = parsed.choices?.[0]?.delta?.content;
      if (typeof delta === "string" && delta.length > 0) yield delta;
    } catch {
      // Skip malformed frames; providers occasionally emit keep-alive noise.
    }
  }
}

async function* streamAnthropic(
  apiKey: string,
  model: string,
  messages: ChatCompletionMessage[]
): AsyncGenerator<string> {
  const system = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");
  const turns = messages.filter(
    (message): message is ChatCompletionMessage & { role: "user" | "assistant" } => message.role !== "system"
  );

  const body = await openStream(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: MAX_OUTPUT_TOKENS,
        stream: true,
        ...(system ? { system } : {}),
        messages: turns.map((message) => ({ role: message.role, content: message.content })),
      }),
    },
    "Anthropic"
  );

  for await (const payload of sseDataLines(body)) {
    try {
      const parsed = JSON.parse(payload);
      if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta") {
        const text = parsed.delta.text;
        if (typeof text === "string" && text.length > 0) yield text;
      }
    } catch {
      // Skip malformed frames.
    }
  }
}

async function* streamOllama(messages: ChatCompletionMessage[]): AsyncGenerator<string> {
  const model = await resolveOllamaModel();
  const body = await openStream(
    `${OLLAMA_BASE_URL}/api/chat`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, stream: true }),
    },
    "Ollama"
  );

  // Ollama streams NDJSON, not SSE: one JSON object per line.
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (line) {
          try {
            const parsed = JSON.parse(line);
            const content = parsed.message?.content;
            if (typeof content === "string" && content.length > 0) yield content;
            if (parsed.done === true) return;
          } catch {
            // Skip malformed lines.
          }
        }
        newlineIndex = buffer.indexOf("\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function streamProvider(entry: ChatModelEntry, apiKey: string, messages: ChatCompletionMessage[]): AsyncGenerator<string> {
  switch (entry.provider) {
    case "openrouter":
      return streamOpenAICompatible("https://openrouter.ai/api/v1", apiKey, entry.model, messages);
    case "groq":
      return streamOpenAICompatible("https://api.groq.com/openai/v1", apiKey, entry.model, messages);
    case "cerebras":
      return streamOpenAICompatible("https://api.cerebras.ai/v1", apiKey, entry.model, messages);
    case "anthropic":
      return streamAnthropic(apiKey, entry.model, messages);
    case "gemini":
      throw new LlmGatewayUnavailableError("Gemini is not in the chat provider pool");
  }
}

/**
 * Streams an assistant reply as text deltas. Tries each provider in the
 * task/tier pool in order; a provider that fails BEFORE producing its first
 * token falls over to the next one. After the first token, errors propagate —
 * the caller already streamed partial output to the user, so silently
 * restarting with another provider would visibly duplicate text.
 */
export async function* streamChatCompletion(
  messages: ChatCompletionMessage[],
  tier: Tier = "free"
): AsyncGenerator<string> {
  if (LLM_BACKEND !== "direct") {
    yield* streamOllama(messages);
    return;
  }

  const entries = CHAT_MODEL_GROUPS[`chat-${tier}`] ?? [];
  let lastError: unknown;

  for (const entry of entries) {
    const apiKey = envKeyForProvider(entry.provider);
    if (!apiKey) continue;

    let firstTokenSeen = false;
    try {
      for await (const delta of streamProvider(entry, apiKey, messages)) {
        firstTokenSeen = true;
        yield delta;
      }
      if (firstTokenSeen) return;
      // A stream that opened but produced zero tokens counts as a failure —
      // fall through to the next provider.
      lastError = new LlmGatewayUnavailableError(`${entry.provider}/${entry.model} produced no tokens`);
    } catch (error) {
      if (firstTokenSeen) throw error;
      lastError = error;
    }
  }

  const reason = lastError instanceof Error ? lastError.message : String(lastError);
  throw new LlmGatewayUnavailableError(`All providers failed for chat-${tier}${lastError ? `: ${reason}` : ""}`);
}
