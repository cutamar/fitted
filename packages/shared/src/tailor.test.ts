import { describe, expect, it } from "vitest";
import { emptyItem, newBlock } from "./factory.ts";
import { SuggestionSchema, type JobAnalysis } from "./job.ts";
import type { ProfileData } from "./profile.ts";
import { applySuggestions, computeScore, normalizeForMatch, keywordMatches, unsupportedClaims } from "./tailor.ts";

const b1 = newBlock("text", "Led the backend team.");
const b2 = newBlock("bullet", "Cut API latency from 1.5s to 250ms.");
const item = { ...emptyItem(), title: "CTO", subtitle: "Acme", startDate: "2020-09", current: true, content: [b1, b2], tags: ["Python", "Docker"] };
const item2 = { ...emptyItem(), title: "Engineer", subtitle: "Beta", startDate: "2018", endDate: "2020" };
const base: ProfileData = {
  basics: { fullName: "A B", headline: "Engineer", email: "a@b.c", phone: "1", location: "", links: [], summary: "Backend engineer." },
  sections: [{ id: "s1", kind: "experience", title: "Work", hidden: false, items: [item, item2] }],
};
const sug = (o: Record<string, unknown>) => SuggestionSchema.parse({ id: Math.random().toString(36).slice(2), ...o });

const analysis: JobAnalysis = {
  title: "DevOps",
  company: "X",
  jobLanguage: "de",
  seniority: "Senior",
  summary: "",
  requirements: [
    { id: "r1", text: "Kubernetes", mustHave: true },
    { id: "r2", text: "Python", mustHave: false },
  ],
  keywords: [
    { term: "Kubernetes", variants: ["K8s"], importance: "high" },
    { term: "Python", variants: [], importance: "medium" },
    { term: "CI/CD", variants: ["continuous integration"], importance: "low" },
  ],
};

describe("applySuggestions", () => {
  it("rewrites, inserts, removes, and leaves the base untouched", () => {
    const s = [
      sug({ type: "rewrite_block", blockId: b1.id, text: "Led a team of 6 backend engineers." }),
      sug({ type: "insert_block", itemId: item.id, afterBlockId: b1.id, blockType: "bullet", text: "New bullet" }),
      sug({ type: "remove_block", blockId: b2.id }),
      sug({ type: "rewrite_summary", text: "DevOps engineer." }),
    ];
    const { data, changes } = applySuggestions(base, s);
    const content = data.sections[0]!.items[0]!.content;
    expect(content.map((b) => b.text)).toEqual(["Led a team of 6 backend engineers.", "New bullet"]);
    expect(changes.blocks[b1.id]).toEqual({ kind: "changed", before: "Led the backend team." });
    expect(changes.summary).toBe("Backend engineer.");
    expect(base.sections[0]!.items[0]!.content).toHaveLength(2);
    expect(base.basics.summary).toBe("Backend engineer.");
  });

  it("keeps removed blocks and hidden items in diff mode", () => {
    const s = [sug({ type: "remove_block", blockId: b2.id }), sug({ type: "hide_item", itemId: item2.id })];
    const diff = applySuggestions(base, s, { keepRemoved: true });
    expect(diff.data.sections[0]!.items[0]!.content).toHaveLength(2);
    expect(diff.data.sections[0]!.items[1]!.hidden).toBe(false);
    expect(diff.changes.items[item2.id]).toBe("hidden");
    const clean = applySuggestions(base, s);
    expect(clean.data.sections[0]!.items[1]!.hidden).toBe(true);
  });

  it("uses the user's edited text and moves items", () => {
    const s = [sug({ type: "rewrite_headline", text: "AI", editedText: "Mine" }), sug({ type: "move_item", itemId: item2.id, toIndex: 0 })];
    const { data } = applySuggestions(base, s);
    expect(data.basics.headline).toBe("Mine");
    expect(data.sections[0]!.items[0]!.id).toBe(item2.id);
  });

  it("skips suggestions whose target is gone", () => {
    const { data } = applySuggestions(base, [sug({ type: "rewrite_block", blockId: "nope", text: "x" })]);
    expect(data).toEqual(base);
  });
});

describe("keyword matching", () => {
  it("matches across punctuation and variants", () => {
    const t = normalizeForMatch("Built GitLab CI/CD pipelines on K8s.");
    expect(keywordMatches(t, analysis.keywords[0]!)).toBe(true);
    expect(keywordMatches(t, analysis.keywords[2]!)).toBe(true);
    expect(keywordMatches(normalizeForMatch("Pythonic code"), analysis.keywords[1]!)).toBe(false);
  });
});

describe("computeScore", () => {
  it("weights keywords by importance and blends with fit", () => {
    const score = computeScore(base, analysis, {
      requirements: [
        { id: "r1", status: "missing", evidence: "" },
        { id: "r2", status: "met", evidence: "" },
      ],
      overall: "",
      assessedAt: "",
      basedOn: "",
    });
    // Python (2) matched of 3+2+1 → 33
    expect(score.keywords.score).toBe(33);
    expect(score.keywords.missing.map((k) => k.term)).toEqual(["Kubernetes", "CI/CD"]);
    // r2 met (w1) of r1 (w2) + r2 (w1) → 33
    expect(score.fit?.score).toBe(33);
    expect(score.overall).toBe(Math.round(0.4 * 33 + 0.4 * 33 + 0.2 * score.ats.score));
  });
});

describe("unsupportedClaims", () => {
  it("flags keywords and numbers missing from the master profile", () => {
    const s = sug({ type: "rewrite_block", blockId: b2.id, text: "Ran Kubernetes clusters, cut latency from 1.5s to 250ms for 40% savings.", newClaims: ["led migration"] });
    const w = unsupportedClaims(s, base, analysis);
    expect(w).toEqual([
      { kind: "model", text: "led migration" },
      { kind: "keyword", text: "Kubernetes" },
      { kind: "number", text: "40%" },
    ]);
  });
});

describe("unsupportedClaims for tags", () => {
  it("flags tags this entry didn't have, even if they appear elsewhere", () => {
    const s = sug({ type: "set_tags", itemId: item.id, tags: ["Docker", "Python", "Engineer"] });
    expect(unsupportedClaims(s, base, analysis)).toEqual([{ kind: "tag", text: "Engineer" }]);
  });
});
