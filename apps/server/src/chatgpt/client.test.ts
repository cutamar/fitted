import { describe, expect, it } from "vitest";
import { extractJson } from "./client.ts";

describe("extractJson", () => {
  it("reads plain JSON", () => expect(extractJson('{"a":1}')).toEqual({ a: 1 }));
  it("reads fenced JSON with prose around it", () => expect(extractJson('Sure:\n```json\n{"a":[1,2]}\n```\nDone')).toEqual({ a: [1, 2] }));
  it("throws without an object", () => expect(() => extractJson("no json")).toThrow());
});
