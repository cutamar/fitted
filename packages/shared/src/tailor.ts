/**
 * Pure tailoring logic shared by server and client: applying suggestions to a
 * profile snapshot, keyword matching, the deterministic part of the score and
 * detection of claims the master profile doesn't back up.
 */
import type { Assessment, Importance, JobAnalysis, Keyword, Suggestion } from "./job.ts";
import type { Block, Item, ProfileData } from "./profile.ts";

// --- Applying suggestions ------------------------------------------------------

export type BlockChange = { kind: "changed"; before: string } | { kind: "added" } | { kind: "removed" };

/** What changed relative to the base, keyed by ids; drives diff highlighting. */
export interface ChangeSet {
  summary?: string;
  headline?: string;
  blocks: Record<string, BlockChange>;
  tags: Record<string, string[]>;
  items: Record<string, "hidden" | "shown" | "moved">;
  /** Suggestion id that produced each block/item change. */
  sources: Record<string, string>;
}

/** Identifies the set of accepted changes (incl. user edits) an assessment was made for. */
export function acceptedKey(suggestions: Suggestion[]): string {
  return suggestions
    .filter((s) => s.status === "accepted")
    .map((s) => `${s.id}:${s.editedText ?? ""}:${(s.editedTags ?? []).join("|")}`)
    .sort()
    .join(",");
}

export const suggestionText = (s: Suggestion) => s.editedText ?? s.text;
export const suggestionTags = (s: Suggestion) => s.editedTags ?? s.tags;

/** Block id for a block created by an insert suggestion. */
export const insertedBlockId = (s: Suggestion) => `sug-${s.id}`;

function findItem(data: ProfileData, itemId: string): { item: Item; items: Item[] } | null {
  for (const section of data.sections) {
    const item = section.items.find((i) => i.id === itemId);
    if (item) return { item, items: section.items };
  }
  return null;
}

function findBlock(data: ProfileData, blockId: string): { block: Block; item: Item } | null {
  for (const section of data.sections) {
    for (const item of section.items) {
      const block = item.content.find((b) => b.id === blockId);
      if (block) return { block, item };
    }
  }
  return null;
}

/**
 * Applies suggestions in order. With `keepRemoved`, removed blocks and hidden
 * entries stay in the data (marked in the ChangeSet) so a diff view can show them.
 * Suggestions whose targets no longer exist are skipped.
 */
export function applySuggestions(
  base: ProfileData,
  suggestions: Suggestion[],
  { keepRemoved = false }: { keepRemoved?: boolean } = {},
): { data: ProfileData; changes: ChangeSet } {
  const data = structuredClone(base);
  const changes: ChangeSet = { blocks: {}, tags: {}, items: {}, sources: {} };
  const removed = new Set<string>();

  for (const s of suggestions) {
    switch (s.type) {
      case "rewrite_summary":
        changes.summary ??= data.basics.summary;
        data.basics.summary = suggestionText(s);
        break;
      case "rewrite_headline":
        changes.headline ??= data.basics.headline;
        data.basics.headline = suggestionText(s);
        break;
      case "rewrite_block": {
        const hit = findBlock(data, s.blockId);
        if (!hit) break;
        const prev = changes.blocks[s.blockId];
        if (!prev) changes.blocks[s.blockId] = { kind: "changed", before: hit.block.text };
        hit.block.text = suggestionText(s);
        changes.sources[s.blockId] = s.id;
        break;
      }
      case "insert_block": {
        const hit = findItem(data, s.itemId);
        if (!hit) break;
        const block: Block = { id: insertedBlockId(s), type: s.blockType, text: suggestionText(s) };
        const idx = s.afterBlockId ? hit.item.content.findIndex((b) => b.id === s.afterBlockId) : -1;
        hit.item.content.splice(s.afterBlockId && idx === -1 ? hit.item.content.length : idx + 1, 0, block);
        changes.blocks[block.id] = { kind: "added" };
        changes.sources[block.id] = s.id;
        break;
      }
      case "remove_block": {
        const hit = findBlock(data, s.blockId);
        if (!hit) break;
        changes.blocks[s.blockId] = { kind: "removed" };
        changes.sources[s.blockId] = s.id;
        removed.add(s.blockId);
        break;
      }
      case "set_tags": {
        const hit = findItem(data, s.itemId);
        if (!hit) break;
        changes.tags[s.itemId] ??= hit.item.tags;
        hit.item.tags = suggestionTags(s);
        changes.sources[`tags:${s.itemId}`] = s.id;
        break;
      }
      case "hide_item":
      case "show_item": {
        const hit = findItem(data, s.itemId);
        if (!hit) break;
        const hide = s.type === "hide_item";
        if (hit.item.hidden === hide) break;
        changes.items[s.itemId] = hide ? "hidden" : "shown";
        changes.sources[s.itemId] = s.id;
        // In diff mode the entry stays visible so it can be shown struck through.
        hit.item.hidden = hide && !keepRemoved;
        break;
      }
      case "move_item": {
        const hit = findItem(data, s.itemId);
        if (!hit) break;
        const from = hit.items.indexOf(hit.item);
        const to = Math.max(0, Math.min(hit.items.length - 1, s.toIndex));
        if (from === to) break;
        hit.items.splice(from, 1);
        hit.items.splice(to, 0, hit.item);
        changes.items[s.itemId] ??= "moved";
        changes.sources[s.itemId] = s.id;
        break;
      }
    }
  }

  if (!keepRemoved && removed.size) {
    for (const section of data.sections) {
      for (const item of section.items) item.content = item.content.filter((b) => !removed.has(b.id));
    }
  }
  return { data, changes };
}

// --- Text & keyword matching -----------------------------------------------------

/** All visible CV text, used for keyword matching and claim checks. */
export function profileText(data: ProfileData): string {
  const parts: string[] = [data.basics.headline, data.basics.summary];
  for (const s of data.sections) {
    if (s.hidden) continue;
    parts.push(s.title);
    for (const i of s.items) {
      if (i.hidden) continue;
      parts.push(i.title, i.subtitle, ...i.tags, ...i.content.map((b) => b.text));
    }
  }
  return parts.filter(Boolean).join("\n");
}

/** Lowercase, keep letters/digits/+/#, everything else becomes a single space. */
export function normalizeForMatch(text: string): string {
  return ` ${text
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}+#]+/gu, " ")
    .trim()} `;
}

export function keywordMatches(normalizedText: string, kw: Keyword): boolean {
  return [kw.term, ...kw.variants].some((v) => {
    const n = normalizeForMatch(v);
    return n.trim().length > 0 && normalizedText.includes(n);
  });
}

// --- Score -------------------------------------------------------------------------

const IMPORTANCE_WEIGHT: Record<Importance, number> = { high: 3, medium: 2, low: 1 };

export interface AtsCheck {
  id: string;
  label: string;
  pass: boolean;
  detail: string;
}

export interface Score {
  /** 0–100 */
  overall: number;
  keywords: { score: number; matched: Keyword[]; missing: Keyword[] };
  /** AI requirement fit; null before the first assessment. */
  fit: { score: number; met: number; partial: number; missing: number } | null;
  ats: { score: number; checks: AtsCheck[] };
}

export function wordCount(data: ProfileData): number {
  return profileText(data).split(/\s+/).filter(Boolean).length + data.basics.fullName.split(/\s+/).length;
}

export function atsChecks(data: ProfileData): AtsCheck[] {
  const visible = data.sections.filter((s) => !s.hidden);
  const experience = visible.filter((s) => s.kind === "experience").flatMap((s) => s.items.filter((i) => !i.hidden));
  const words = wordCount(data);
  const longBullets = visible
    .flatMap((s) => s.items.filter((i) => !i.hidden))
    .flatMap((i) => i.content)
    .filter((b) => b.type === "bullet" && b.text.split(/\s+/).length > 40);
  const emptySections = visible.filter((s) => !s.items.some((i) => !i.hidden));

  return [
    { id: "contact", label: "Email and phone present", pass: !!data.basics.email && !!data.basics.phone, detail: "Recruiters and ATS need both to contact you." },
    { id: "headline", label: "Professional headline", pass: !!data.basics.headline.trim(), detail: "A title under your name that matches the role helps ATS ranking." },
    { id: "summary", label: "Summary present", pass: data.basics.summary.trim().split(/\s+/).length >= 20, detail: "A short profile paragraph (2–4 sentences) tailored to the role." },
    { id: "experience", label: "Work experience listed", pass: experience.length > 0, detail: "At least one entry in a work experience section." },
    {
      id: "dates",
      label: "Every job has dates",
      pass: experience.length > 0 && experience.every((i) => i.startDate && (i.endDate || i.current)),
      detail: "ATS calculate years of experience from start and end dates.",
    },
    {
      id: "titles",
      label: "Every job has title and company",
      pass: experience.length > 0 && experience.every((i) => i.title && i.subtitle),
      detail: "Missing titles or employers often break ATS parsing.",
    },
    { id: "length", label: "Length 350–1,100 words", pass: words >= 350 && words <= 1100, detail: `Currently about ${words} words (1–2 pages).` },
    { id: "bullets", label: "Concise bullet points", pass: longBullets.length === 0, detail: longBullets.length ? `${longBullets.length} bullet(s) over 40 words.` : "All bullets are under 40 words." },
    { id: "empty", label: "No empty sections", pass: emptySections.length === 0, detail: emptySections.length ? `Empty: ${emptySections.map((s) => s.title).join(", ")}` : "All visible sections have content." },
  ];
}

export function fitScore(analysis: JobAnalysis, assessment: Assessment): Score["fit"] {
  let total = 0;
  let got = 0;
  const counts = { met: 0, partial: 0, missing: 0 };
  for (const req of analysis.requirements) {
    const a = assessment.requirements.find((r) => r.id === req.id);
    const status = a?.status ?? "missing";
    const w = req.mustHave ? 2 : 1;
    total += w;
    got += w * (status === "met" ? 1 : status === "partial" ? 0.5 : 0);
    counts[status]++;
  }
  return { score: total ? Math.round((got / total) * 100) : 100, ...counts };
}

export function computeScore(data: ProfileData, analysis: JobAnalysis, assessment: Assessment | null): Score {
  const text = normalizeForMatch(profileText(data));
  const matched: Keyword[] = [];
  const missing: Keyword[] = [];
  let total = 0;
  let got = 0;
  for (const kw of analysis.keywords) {
    const w = IMPORTANCE_WEIGHT[kw.importance];
    total += w;
    if (keywordMatches(text, kw)) {
      matched.push(kw);
      got += w;
    } else missing.push(kw);
  }
  const keywordScore = total ? Math.round((got / total) * 100) : 100;

  const checks = atsChecks(data);
  const atsScore = Math.round((checks.filter((c) => c.pass).length / checks.length) * 100);
  const fit = assessment ? fitScore(analysis, assessment) : null;

  const overall = fit
    ? Math.round(0.4 * keywordScore + 0.4 * fit.score + 0.2 * atsScore)
    : Math.round(0.65 * keywordScore + 0.35 * atsScore);

  return { overall, keywords: { score: keywordScore, matched, missing }, fit, ats: { score: atsScore, checks } };
}

// --- Claim checks -------------------------------------------------------------------

export interface ClaimWarning {
  kind: "keyword" | "number" | "model" | "tag";
  text: string;
}

/**
 * Flags things a suggestion introduces that the master profile doesn't contain:
 * job keywords and numbers absent from the profile, plus what the model itself declared.
 */
export function unsupportedClaims(s: Suggestion, master: ProfileData, analysis: JobAnalysis): ClaimWarning[] {
  const warnings: ClaimWarning[] = s.newClaims.map((text) => ({ kind: "model" as const, text }));
  if (s.type === "set_tags") {
    const before = new Set(master.sections.flatMap((sec) => sec.items).find((i) => i.id === s.itemId)?.tags.map((t) => t.toLowerCase()) ?? []);
    for (const tag of suggestionTags(s)) if (!before.has(tag.toLowerCase())) warnings.push({ kind: "tag", text: tag });
  }
  const masterText = normalizeForMatch(profileText(master));
  const proposed = s.type === "set_tags" ? suggestionTags(s).join(", ") : s.type === "remove_block" || s.type.endsWith("_item") ? "" : suggestionText(s);
  if (!proposed) return warnings;
  const proposedNorm = normalizeForMatch(proposed);

  for (const kw of analysis.keywords) {
    if (keywordMatches(proposedNorm, kw) && !keywordMatches(masterText, kw)) {
      warnings.push({ kind: "keyword", text: kw.term });
    }
  }
  for (const num of new Set(proposed.match(/\d+(?:[.,]\d+)?\s?(?:%|x|k|\+)?/gi) ?? [])) {
    const digits = num.replace(/[^\d]/g, "");
    if (digits && !masterText.replace(/\s/g, "").includes(digits)) warnings.push({ kind: "number", text: num.trim() });
  }
  return warnings;
}
