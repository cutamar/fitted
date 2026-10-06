/**
 * Responses API on the user's ChatGPT plan:
 * https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference
 *
 * Plan usage requires store:false + stream:true and rejects temperature,
 * max_output_tokens, system-role items and hosted tools.
 */
import { z } from "zod";
import type { ChatGPTModel } from "@rb/shared";
import { getSetting } from "../db.ts";
import { getAccessToken, refresh } from "./auth.ts";
import { parseSSE } from "./sse.ts";

const API = "https://api.openai.com/v1";

export class ChatGPTError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** User-facing explanations for the documented plan-usage error codes. */
const FRIENDLY: Record<string, string> = {
  subscription_sharing_user_not_eligible: "Your ChatGPT account isn't eligible for plan usage in other apps (Plus or Pro required).",
  subscription_sharing_usage_limit_exceeded:
    "This app reached the usage cap you set for it, or your plan limit. Check ChatGPT → Settings → Usage.",
  subscription_sharing_usage_unavailable: "ChatGPT plan usage is temporarily unavailable. Try again in a moment.",
  subscription_sharing_invalid_user: "Your ChatGPT access was revoked. Please sign in again.",
};

async function apiFetch(pathname: string, init: RequestInit = {}, retried = false): Promise<Response> {
  const token = await getAccessToken();
  const res = await fetch(`${API}${pathname}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 && !retried) {
    await refresh();
    return apiFetch(pathname, init, true);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
    const code = body?.error?.code ?? `http_${res.status}`;
    throw new ChatGPTError(res.status, code, FRIENDLY[code] ?? body?.error?.message ?? `ChatGPT request failed (${res.status}).`);
  }
  return res;
}

export async function listModels(): Promise<ChatGPTModel[]> {
  const res = await apiFetch("/models");
  const json = (await res.json()) as {
    models?: { slug: string; display_name?: string; visibility?: string }[];
    data?: { id: string }[];
  };
  if (json.models) {
    return json.models
      .filter((m) => !m.visibility || m.visibility === "list")
      .map((m) => ({ slug: m.slug, displayName: m.display_name ?? m.slug }));
  }
  return (json.data ?? []).map((m) => ({ slug: m.id, displayName: m.id }));
}

export async function resolveModel(): Promise<string> {
  const chosen = getSetting("model");
  if (chosen) return chosen;
  const [first] = await listModels();
  if (!first) throw new ChatGPTError(400, "no_models", "No models are available for your ChatGPT account.");
  return first.slug;
}

export interface GenerateOptions {
  instructions: string;
  input: string;
  /** JSON schema for structured output. */
  jsonSchema?: { name: string; schema: Record<string, unknown> };
  signal?: AbortSignal;
}

/** Failures worth retrying: dropped streams, upstream 5xx, temporary unavailability. */
const PERMANENT = new Set([
  "subscription_sharing_user_not_eligible",
  "subscription_sharing_usage_limit_exceeded",
  "subscription_sharing_unsupported_capability",
  "subscription_sharing_invalid_user",
  "subscription_sharing_route_not_supported",
]);
function isTransient(err: unknown): boolean {
  if (err instanceof ChatGPTError) return !PERMANENT.has(err.code) && (err.status >= 500 || err.code === "stream_ended" || err.code === "response_failed");
  // fetch() network failures (connection reset mid-stream etc.)
  return err instanceof TypeError || (err as { name?: string })?.name === "SocketError";
}

/** Streams a response; retries transient failures twice (long responses occasionally drop). */
export async function generateText(opts: GenerateOptions): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await generateTextOnce(opts);
    } catch (err) {
      if (attempt >= 3 || opts.signal?.aborted || !isTransient(err)) throw err;
      console.warn(`ChatGPT request failed (${(err as Error).message}); retry ${attempt}/2`);
      await new Promise((r) => setTimeout(r, attempt * 2000));
    }
  }
}

async function generateTextOnce(opts: GenerateOptions): Promise<string> {
  const body: Record<string, unknown> = {
    model: await resolveModel(),
    instructions: opts.instructions,
    input: [{ role: "user", content: [{ type: "input_text", text: opts.input }] }],
    store: false,
    stream: true,
  };
  if (opts.jsonSchema) {
    body.text = { format: { type: "json_schema", name: opts.jsonSchema.name, schema: opts.jsonSchema.schema, strict: false } };
  }

  const res = await apiFetch("/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  if (!res.body) throw new ChatGPTError(502, "empty_body", "ChatGPT returned an empty response.");

  let text = "";
  for await (const ev of parseSSE(res.body)) {
    if (ev.data === "[DONE]") break;
    let payload: { type?: string; delta?: string; response?: { error?: { code?: string; message?: string }; incomplete_details?: { reason?: string } }; code?: string; message?: string };
    try {
      payload = JSON.parse(ev.data);
    } catch {
      continue;
    }
    switch (payload.type ?? ev.event) {
      case "response.output_text.delta":
        text += payload.delta ?? "";
        break;
      case "response.completed":
        return text;
      case "response.failed": {
        const e = payload.response?.error;
        throw new ChatGPTError(502, e?.code ?? "response_failed", FRIENDLY[e?.code ?? ""] ?? e?.message ?? "ChatGPT failed to respond.");
      }
      case "response.incomplete":
        throw new ChatGPTError(502, "response_incomplete", `ChatGPT stopped early (${payload.response?.incomplete_details?.reason ?? "unknown reason"}).`);
      case "error":
        throw new ChatGPTError(502, payload.code ?? "stream_error", FRIENDLY[payload.code ?? ""] ?? payload.message ?? "ChatGPT stream error.");
    }
  }
  throw new ChatGPTError(502, "stream_ended", "ChatGPT stream ended before completing.");
}

/** Pulls the first JSON object out of model text (tolerates code fences or prose around it). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) throw new SyntaxError("No JSON object in model output.");
  return JSON.parse(candidate.slice(start, end + 1));
}

/**
 * Structured output validated with zod. Tries the json_schema text format first;
 * if the plan route rejects it, falls back to prompting for JSON. One repair
 * round-trip on validation errors.
 */
export async function generateJson<T extends z.ZodType>(
  schema: T,
  opts: Omit<GenerateOptions, "jsonSchema"> & { name: string },
): Promise<z.infer<T>> {
  const jsonSchema = z.toJSONSchema(schema, { target: "draft-2020-12" }) as Record<string, unknown>;
  delete jsonSchema.$schema;
  const schemaHint = `\n\nRespond with a single JSON object matching this JSON schema, and nothing else:\n${JSON.stringify(jsonSchema)}`;

  let text: string;
  try {
    text = await generateText({ ...opts, instructions: opts.instructions + schemaHint, jsonSchema: { name: opts.name, schema: jsonSchema } });
  } catch (err) {
    if (!(err instanceof ChatGPTError && (err.code === "subscription_sharing_unsupported_capability" || err.status === 400))) throw err;
    text = await generateText({ ...opts, instructions: opts.instructions + schemaHint });
  }

  const first = parseWith(schema, text);
  if (first.ok) return first.value;

  const repaired = await generateText({
    ...opts,
    instructions: opts.instructions + schemaHint,
    input: `${opts.input}\n\n---\nYour previous answer was invalid: ${first.error}\nPrevious answer:\n${text}\n\nReturn the corrected JSON only.`,
  });
  const second = parseWith(schema, repaired);
  if (second.ok) return second.value;
  throw new ChatGPTError(502, "invalid_output", `ChatGPT returned data in an unexpected shape: ${second.error}`);
}

function parseWith<T extends z.ZodType>(schema: T, text: string): { ok: true; value: z.infer<T> } | { ok: false; error: string } {
  try {
    const result = schema.safeParse(extractJson(text));
    if (result.success) return { ok: true, value: result.data };
    return { ok: false, error: z.prettifyError(result.error).slice(0, 2000) };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
