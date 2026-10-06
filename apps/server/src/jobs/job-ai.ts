import { z } from "zod";
import {
  BLOCK_TYPES,
  JobAnalysisSchema,
  LANGUAGE_NAMES,
  RequirementStatusSchema,
  SUGGESTION_TYPES,
  SuggestionSchema,
  newId,
  type Assessment,
  type JobAnalysis,
  type Language,
  type ProfileData,
  type Suggestion,
} from "@rb/shared";
import { generateJson } from "../chatgpt/client.ts";
import { cvForModel } from "./model-cv.ts";

const languageName = (l: Language) => (l === "de" ? "German" : LANGUAGE_NAMES[l]);

// --- 1. Job analysis --------------------------------------------------------------

const ModelAnalysis = z.object({
  title: z.string(),
  company: z.string(),
  jobLanguage: z.enum(["en", "de", "other"]),
  seniority: z.string(),
  summary: z.string(),
  requirements: z.array(z.object({ text: z.string(), mustHave: z.boolean() })),
  keywords: z.array(z.object({ term: z.string(), variants: z.array(z.string()), importance: z.enum(["high", "medium", "low"]) })),
});

export async function analyzeJob(description: string, language: Language): Promise<JobAnalysis> {
  const out = await generateJson(ModelAnalysis, {
    name: "job_analysis",
    instructions: `You analyze a job advertisement for an applicant whose CV is written in ${languageName(language)}.

OUTPUT LANGUAGE: write "summary", every requirement "text" and every keyword "term" in ${languageName(language)}, translating from the ad's language if needed. The ad's original wording goes into keyword "variants".

Return:
- title, company: as stated ("" if unknown).
- jobLanguage: language the ad is written in.
- seniority: e.g. "Senior", "Lead", "Mid-level", as implied by the ad.
- summary: 1–2 sentences on what the role is about, in ${languageName(language)}.
- requirements: the distinct requirements (8–15; merge closely related ones) (skills, experience, education, languages, certifications, responsibilities the candidate must be able to do). Phrase each briefly in ${languageName(language)}. mustHave=true for explicit requirements ("required", "must", "you have", "Voraussetzung"), false for "nice to have", "plus", "ideally", "wünschenswert".
- keywords: 15–35 terms an ATS would scan for: hard skills, tools, technologies, methods, certifications, domain terms, the job title. "term" is the canonical form in ${languageName(language)} (keep proper names and tech terms as-is, e.g. "Kubernetes", "CI/CD"). "variants" lists other forms that should count as a match: the ad's original wording if it differs (e.g. a German term), abbreviations, common spellings ("K8s", "Continuous Integration"). importance=high for must-haves and terms repeated in the ad, medium for clearly relevant, low for minor mentions. No soft-skill filler like "team player" unless the ad stresses it.`,
    input: description,
  });
  return {
    ...out,
    requirements: out.requirements.map((r, i) => ({ id: `r${i + 1}`, text: r.text, mustHave: r.mustHave })),
  };
}

// --- 2. Assessment + suggestions ---------------------------------------------------------

const ModelAssessment = z.object({
  requirements: z.array(z.object({ id: z.string(), status: RequirementStatusSchema, evidence: z.string() })),
  overall: z.string(),
});

const ModelSuggestion = z.object({
  type: z.enum(SUGGESTION_TYPES),
  itemId: z.string(),
  blockId: z.string(),
  afterBlockId: z.string(),
  blockType: z.enum(BLOCK_TYPES),
  text: z.string(),
  tags: z.array(z.string()),
  toIndex: z.number(),
  rationale: z.string(),
  requirementIds: z.array(z.string()),
  newClaims: z.array(z.string()),
});
type ModelSuggestion = z.infer<typeof ModelSuggestion>;

const TAILOR_RULES = (language: Language) => `Rules for suggestions:
- Write every proposed text in ${languageName(language)}, even if the job ad is in another language.
- TRUTH FIRST: only rephrase, reorder, emphasize, condense or hide what the CV already says. Never invent employers, titles, dates, tools, numbers, certifications or achievements. If a requirement isn't backed by the CV, do not claim it.
- If a change would need a fact that is not in the CV but the candidate plausibly has it (e.g. a tool closely tied to their stack), you may propose it at most twice in total, and you MUST list each unbacked fact in "newClaims" so the user can confirm it. Otherwise newClaims is [].
- Use the job ad's exact keyword spellings where the CV truthfully supports them (ATS match literally). No keyword stuffing; keep sentences natural.
- Strong bullets: action verb, what you did, measurable result. Keep existing numbers exact. Max ~30 words per bullet.
- Each suggestion is one atomic change. Prefer 8–15 high-impact suggestions, most important first. Typical ones: rewrite the summary for this role, rewrite the headline, sharpen bullets that relate to requirements, reorder tags so relevant skills come first, hide entries that are irrelevant and cost space, move the most relevant entry up within its section.
- Don't suggest changes for things that are already good, and no cosmetic rewrites: every rewrite must add a relevant keyword, make relevance to a requirement clearer, or add impact.
- Never reorder entries in work experience, education or volunteering: they stay reverse-chronological. move_item is only for sections like skills, projects or certifications.
- set_tags on an entry may reorder or drop its own tags; adding a tag that this entry doesn't have counts as a new claim for that entry.

Suggestion fields (all required; use "" / [] / 0 when not applicable):
- type: rewrite_summary | rewrite_headline (text = new text)
  | rewrite_block (blockId, text = full new text of that block)
  | insert_block (itemId, afterBlockId = block to insert after or "" for the start, blockType, text)
  | remove_block (blockId)
  | set_tags (itemId, tags = complete new ordered list; may reorder/remove; adding a tag not in the CV requires newClaims)
  | hide_item / show_item (itemId)
  | move_item (itemId, toIndex = new 0-based position within its section)
- ids are the bracketed ids from the CV, e.g. "i2", "b7".
- rationale: one short sentence, in English, on why this helps for this job.
- requirementIds: ids of the requirements this addresses (e.g. ["r1","r4"]).`;

function describeAnalysis(a: JobAnalysis): string {
  return [
    `Role: ${a.title} at ${a.company || "?"} (${a.seniority})`,
    `About: ${a.summary}`,
    "Requirements:",
    ...a.requirements.map((r) => `- ${r.id} [${r.mustHave ? "must" : "nice"}] ${r.text}`),
    "Keywords:",
    ...a.keywords.map((k) => `- ${k.term} (${k.importance})${k.variants.length ? ` aka ${k.variants.join(", ")}` : ""}`),
  ].join("\n");
}

function toSuggestion(m: ModelSuggestion, resolve: (id: string) => string | null): Suggestion | null {
  const s = validSuggestion(m, resolve);
  if (!s) console.warn(`Dropped invalid suggestion: ${m.type} item=${m.itemId || "-"} block=${m.blockId || "-"} after=${m.afterBlockId || "-"} text=${m.text.length}ch tags=${m.tags.length}`);
  return s;
}

function validSuggestion(m: ModelSuggestion, resolve: (id: string) => string | null): Suggestion | null {
  const itemId = m.itemId ? resolve(m.itemId) : null;
  const blockId = m.blockId ? resolve(m.blockId) : null;
  const afterBlockId = m.afterBlockId ? resolve(m.afterBlockId) : null;
  const s = SuggestionSchema.parse({
    id: newId(),
    type: m.type,
    itemId: itemId ?? "",
    blockId: blockId ?? "",
    afterBlockId: afterBlockId ?? "",
    blockType: m.blockType,
    text: m.text.trim(),
    tags: m.tags.map((t) => t.trim()).filter(Boolean),
    toIndex: Math.max(0, Math.round(m.toIndex)),
    rationale: m.rationale,
    requirementIds: m.requirementIds,
    newClaims: m.newClaims.filter((c) => c.trim()),
  });
  // Drop suggestions that reference unknown ids or lack content.
  switch (s.type) {
    case "rewrite_summary":
    case "rewrite_headline":
      return s.text ? s : null;
    case "rewrite_block":
      return blockId && s.text ? s : null;
    case "insert_block":
      return itemId && s.text && (m.afterBlockId === "" || afterBlockId) ? s : null;
    case "remove_block":
      return blockId ? s : null;
    case "set_tags":
      return itemId && s.tags.length ? s : null;
    default:
      return itemId ? s : null;
  }
}

const CHRONOLOGICAL = new Set(["experience", "education", "volunteering"]);

/** Removes suggestions that would break the reverse-chronological order of dated sections. */
function dropChronologyBreaks(data: ProfileData, suggestions: Suggestion[]): Suggestion[] {
  const chronologicalItems = new Set(
    data.sections.filter((s) => CHRONOLOGICAL.has(s.kind)).flatMap((s) => s.items.map((i) => i.id)),
  );
  return suggestions.filter((s) => !(s.type === "move_item" && chronologicalItems.has(s.itemId)));
}

export async function assessAndSuggest(
  data: ProfileData,
  analysis: JobAnalysis,
  language: Language,
  instructions: string,
): Promise<{ assessment: Assessment; suggestions: Suggestion[] }> {
  const cv = cvForModel(data);
  const out = await generateJson(z.object({ assessment: ModelAssessment, suggestions: z.array(ModelSuggestion) }), {
    name: "cv_tailoring",
    instructions: `You are an expert recruiter and CV writer. You compare a candidate's CV with a job and propose precise edits that make the CV a stronger, ATS-friendly match — without inventing anything.

First, assess each requirement against the CV: status met (clearly shown), partial (related or implied), missing (not shown); evidence = where in the CV (quote briefly or name the entry) or what is lacking, in English. "overall" = 2–3 sentences in English on fit, strengths and gaps.

Then propose suggestions.

${TAILOR_RULES(language)}${instructions.trim() ? `\n\nThe user's preferences for this job (follow them):\n${instructions.trim()}` : ""}`,
    input: `JOB\n${describeAnalysis(analysis)}\n\nCV\n${cv.text}`,
  });

  const known = new Set(analysis.requirements.map((r) => r.id));
  return {
    assessment: {
      requirements: out.assessment.requirements.filter((r) => known.has(r.id)),
      overall: out.assessment.overall,
      assessedAt: new Date().toISOString(),
      basedOn: "",
    },
    suggestions: dropChronologyBreaks(
      data,
      out.suggestions.map((m) => toSuggestion(m, cv.resolve)).filter((s): s is Suggestion => s !== null),
    ),
  };
}

// --- 3. Re-assessment of a tailored version -----------------------------------------

export async function assess(data: ProfileData, analysis: JobAnalysis): Promise<Assessment> {
  const cv = cvForModel(data);
  const out = await generateJson(ModelAssessment, {
    name: "cv_assessment",
    instructions: `You are an expert recruiter. Assess each job requirement against the CV: status met (clearly shown), partial (related or implied), missing (not shown); evidence = where in the CV or what is lacking, in English. "overall" = 2–3 sentences in English on fit, strengths and gaps. Judge only what the CV text shows.`,
    input: `JOB\n${describeAnalysis(analysis)}\n\nCV\n${cv.text}`,
  });
  const known = new Set(analysis.requirements.map((r) => r.id));
  return { requirements: out.requirements.filter((r) => known.has(r.id)), overall: out.overall, assessedAt: new Date().toISOString(), basedOn: "" };
}

// --- 4. Regenerating one suggestion -------------------------------------------------------

export async function regenerateSuggestion(
  data: ProfileData,
  analysis: JobAnalysis,
  language: Language,
  original: Suggestion,
  instruction: string,
): Promise<Suggestion | null> {
  const cv = cvForModel(data);
  const short = cv.shortIdOf;
  const current = {
    type: original.type,
    itemId: short(original.itemId),
    blockId: short(original.blockId),
    afterBlockId: short(original.afterBlockId),
    blockType: original.blockType,
    text: original.editedText ?? original.text,
    tags: original.editedTags ?? original.tags,
    toIndex: original.toIndex,
    rationale: original.rationale,
    requirementIds: original.requirementIds,
    newClaims: original.newClaims,
  };
  const out = await generateJson(ModelSuggestion, {
    name: "cv_suggestion",
    instructions: `You revise ONE suggested CV edit according to the user's feedback. Keep the same type and target ids unless the feedback asks otherwise. Return a single suggestion object.

${TAILOR_RULES(language)}`,
    input: `JOB\n${describeAnalysis(analysis)}\n\nCV\n${cv.text}\n\nCURRENT SUGGESTION\n${JSON.stringify(current)}\n\nUSER FEEDBACK\n${instruction.trim() || "Give a different, better alternative."}`,
  });
  const next = toSuggestion(out, cv.resolve);
  return next && { ...next, id: original.id };
}

// --- 5. Cover letter ----------------------------------------------------------------------

export async function writeCoverLetter(data: ProfileData, analysis: JobAnalysis, language: Language, instructions: string): Promise<string> {
  const out = await generateJson(z.object({ text: z.string() }), {
    name: "cover_letter",
    instructions: `You write a concise, specific cover letter for this job, in ${languageName(language)}.
- Use ONLY facts from the CV. Never invent achievements, numbers, tools, motivations or company knowledge beyond what the job ad says.
- 230–330 words, 3–4 short paragraphs: why this role, 2–3 most relevant achievements tied to the main requirements, closing with availability for an interview.
- Natural, confident tone; no clichés ("I am writing to apply", "team player", "passionate"), no keyword stuffing.
- Start with the salutation (${language === "de" ? '"Sehr geehrte Damen und Herren," unless a contact person is named' : '"Dear Hiring Team," unless a contact person is named'}) and end with the sign-off and the candidate's name. No address block or date: those are added separately.
- Separate paragraphs with a blank line. Return {"text": "..."}.${instructions.trim() ? `\n\nThe user's preferences (follow them):\n${instructions.trim()}` : ""}`,
    input: `JOB\n${describeAnalysis(analysis)}\n\nCV\n${cvForModel(data).text}`,
  });
  return out.text.trim();
}

// --- 6. Covering one requirement / keyword on request -----------------------------------

export interface GapTarget {
  /** What to cover: a requirement text or a keyword. */
  label: string;
  kind: "requirement" | "keyword";
  requirementId?: string;
  /** What the user says is true about it; empty = only what the CV already supports. */
  details: string;
  /** Entry the user wants it in; empty = model picks. */
  itemId?: string;
}

export async function suggestForGap(data: ProfileData, analysis: JobAnalysis, language: Language, target: GapTarget): Promise<Suggestion | null> {
  const cv = cvForModel(data);
  const where = target.itemId ? cv.shortIdOf(target.itemId) : "";
  const out = await generateJson(ModelSuggestion, {
    name: "cv_gap_suggestion",
    instructions: `The user wants their CV to cover one ${target.kind} of the job. Propose exactly ONE suggestion that adds it in the most natural place.

How to choose:
- If an existing bullet or paragraph is about related work, prefer rewrite_block that weaves it in (keep everything else in that block, including numbers).
- Otherwise insert_block: a new bullet in the most relevant entry, placed after the most related block (afterBlockId), or "" for the start.
- For a pure tool/skill keyword with no story to tell, set_tags on the most relevant entry or skills group: the entry's existing tags in their order, plus the keyword placed by relevance.
${where ? `- The user wants it in entry [${where}]. Use that entry (or one of its blocks).` : ""}
- Facts: use the CV and the user's statement below. The user's statement is confirmed true: do not list it in newClaims. Anything beyond both goes into newClaims.
- Use the job's exact wording for the ${target.kind} where it fits naturally.

${TAILOR_RULES(language)}`,
    input: `JOB\n${describeAnalysis(analysis)}\n\nCOVER THIS ${target.kind.toUpperCase()}\n${target.label}\n\nUSER'S STATEMENT (true)\n${target.details.trim() || "(none: only use what the CV already supports)"}\n\nCV\n${cv.text}`,
  });
  const s = toSuggestion(out, cv.resolve);
  if (!s) return null;
  return { ...s, confirmedFacts: target.details.trim(), requirementIds: target.requirementId ? [...new Set([target.requirementId, ...s.requirementIds])] : s.requirementIds };
}

// --- 7. Quick boost: yes/no questions, then changes from the "yes" answers -----------------

export interface BoostGap {
  label: string;
  kind: "keyword" | "requirement";
  requirementId?: string;
  /** Why it matters, e.g. "must-have, missing" or "high-importance keyword". */
  weight: string;
}

export async function boostQuestions(data: ProfileData, analysis: JobAnalysis, gaps: BoostGap[]): Promise<{ question: string; gapIndex: number }[]> {
  const out = await generateJson(z.object({ questions: z.array(z.object({ question: z.string(), gapIndex: z.number() })) }), {
    name: "boost_questions",
    instructions: `The candidate wants to raise their CV's match for this job quickly by answering yes/no questions. You get the CV and a numbered list of gaps (missing keywords and unmet requirements), most important first.

Write one short yes/no question per gap worth asking, at most 10, most score-relevant first:
- Ask about real experience, concretely: "Have you used Amplitude or Mixpanel for product analytics?" not "Do you know analytics?"
- Merge gaps that one answer covers (e.g. a keyword that is part of a requirement): ask once, use the more important gapIndex.
- Skip gaps the CV already clearly covers, and gaps a yes/no can't settle (e.g. years of experience the dates already show).
- English, plain, max ~15 words, no jargon beyond the job's own terms.
Return {"questions": [{"question": "...", "gapIndex": n}]}.`,
    input: `JOB\n${describeAnalysis(analysis)}\n\nGAPS\n${gaps.map((g, i) => `${i}. [${g.kind}, ${g.weight}] ${g.label}`).join("\n")}\n\nCV\n${cvForModel(data).text}`,
  });
  return out.questions.filter((q) => q.gapIndex >= 0 && q.gapIndex < gaps.length && q.question.trim()).slice(0, 10);
}

export interface BoostFact {
  label: string;
  requirementId?: string;
  /** The question and the user's optional detail, both confirmed true. */
  statement: string;
}

const BoostSuggestion = ModelSuggestion.extend({
  /** 1-based numbers of the confirmed facts this edit works in. */
  facts: z.array(z.number()),
});

async function boostPass(cv: ReturnType<typeof cvForModel>, analysis: JobAnalysis, language: Language, facts: BoostFact[]) {
  const out = await generateJson(z.object({ suggestions: z.array(BoostSuggestion) }), {
    name: "boost_suggestions",
    instructions: `The candidate confirmed the facts below are TRUE. Work EACH of them into the CV, where it belongs:
- Prefer weaving a fact into an existing related bullet or paragraph (rewrite_block, keep everything else in it, including numbers); otherwise add a bullet to the most relevant entry (insert_block); tools/skills without a story go into the most relevant skills list or entry tags (set_tags: that entry's current tags plus the new ones).
- Spread the facts: each fact gets its own edit in the entry where it happened. Put at most two facts into one block, and only if they clearly belong together. Never edit the same block twice.
- "facts" lists the numbers of the facts each edit works in. Every fact number must appear in at least one edit.
- The user's own words are authoritative: when a fact has a "User's detail", use exactly what the detail confirms. If the detail is narrower than the question (e.g. names only some teams or tools), use only what the detail names, never the rest of the question.
- Use the job's exact wording for keywords the user confirmed. Confirmed facts count as backed by the CV: newClaims stays [] unless you add something beyond the facts and the CV.

${TAILOR_RULES(language)}

SCOPE (overrides the suggestion count above): make ONLY the edits needed to work in the confirmed facts, at most ${facts.length * 2} in total. These edits are applied without review, so do not touch anything unrelated to the facts: no general polishing, no summary or headline rewrite unless a fact belongs there.`,
    input: `JOB\n${describeAnalysis(analysis)}\n\nCONFIRMED FACTS (true)\n${facts.map((f, i) => `${i + 1}. ${f.statement} (covers: ${f.label}${f.requirementId ? `, ${f.requirementId}` : ""})`).join("\n")}\n\nCV\n${cv.text}`,
  });
  return out.suggestions;
}

export async function boostSuggestions(data: ProfileData, analysis: JobAnalysis, language: Language, facts: BoostFact[]): Promise<Suggestion[]> {
  const cv = cvForModel(data);
  const confirmed = facts.map((f) => f.statement).join("\n");
  const toAccepted = (m: z.infer<typeof BoostSuggestion>): Suggestion | null => {
    const s = toSuggestion(m, cv.resolve);
    return s ? { ...s, confirmedFacts: confirmed, status: "accepted" } : null;
  };

  const first = (await boostPass(cv, analysis, language, facts)).map((m) => ({ m, s: toAccepted(m) }));
  const result = first.map((x) => x.s).filter((s): s is Suggestion => s !== null);
  const usedBlocks = new Set(result.map((s) => s.blockId).filter(Boolean));

  // Facts the model skipped (or whose edit was invalid) get one targeted second pass.
  const coveredFacts = new Set(first.filter((x) => x.s).flatMap((x) => x.m.facts));
  const missing = facts.filter((_, i) => !coveredFacts.has(i + 1));
  if (missing.length) {
    console.log(`Quick boost: second pass for ${missing.length} uncovered fact(s)`);
    const second = await boostPass(cv, analysis, language, missing);
    for (const m of second) {
      const s = toAccepted(m);
      // Don't overwrite a block the first pass already rewrote.
      if (s && !(s.blockId && usedBlocks.has(s.blockId))) result.push(s);
    }
  }
  // Hard cap in case the model over-edits: these are accepted without review.
  return result.slice(0, facts.length * 2);
}
