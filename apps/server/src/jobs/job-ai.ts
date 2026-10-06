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
