import { describe, expect, it } from "vitest";
import { parseSSE } from "./sse.ts";

async function* chunks(...parts: string[]) {
  const enc = new TextEncoder();
  for (const p of parts) yield enc.encode(p);
}

async function collect(...parts: string[]) {
  const out = [];
  for await (const ev of parseSSE(chunks(...parts))) out.push(ev);
  return out;
}

describe("parseSSE", () => {
  it("parses events split across chunks", async () => {
    const events = await collect('event: response.output_text.delta\ndata: {"del', 'ta":"Hi"}\n\n', "data: [DONE]\n\n");
    expect(events).toEqual([
      { event: "response.output_text.delta", data: '{"delta":"Hi"}' },
      { event: null, data: "[DONE]" },
    ]);
  });

  it("handles CRLF, comments and multi-line data", async () => {
    const events = await collect(": keep-alive\r\n\r\ndata: a\r\ndata: b\r\n\r\n");
    expect(events).toEqual([{ event: null, data: "a\nb" }]);
  });

  it("flushes a trailing event without blank line", async () => {
    expect(await collect("data: last")).toEqual([{ event: null, data: "last" }]);
  });
});
