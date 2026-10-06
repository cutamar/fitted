import { z } from "zod";
import { BlockTypeSchema, LanguageSchema, ProfileDataSchema } from "./profile.ts";

export const ImportanceSchema = z.enum(["high", "medium", "low"]);
export type Importance = z.infer<typeof ImportanceSchema>;

export const RequirementSchema = z.object({
  id: z.string(),
  /** Written in the profile's language. */
  text: z.string(),
  mustHave: z.boolean(),
});
export type Requirement = z.infer<typeof RequirementSchema>;

export const KeywordSchema = z.object({
  /** Canonical term in the profile's language, e.g. "project management". */
  term: z.string(),
  /** Other spellings that count as a match: the ad's original wording, abbreviations, synonyms. */
  variants: z.array(z.string()).default([]),
  importance: ImportanceSchema,
});
export type Keyword = z.infer<typeof KeywordSchema>;

export const JobAnalysisSchema = z.object({
  title: z.string(),
  company: z.string(),
  /** Language the ad is written in. */
  jobLanguage: z.enum(["en", "de", "other"]),
  seniority: z.string(),
  summary: z.string(),
  requirements: z.array(RequirementSchema),
  keywords: z.array(KeywordSchema),
});
export type JobAnalysis = z.infer<typeof JobAnalysisSchema>;

export const RequirementStatusSchema = z.enum(["met", "partial", "missing"]);
export type RequirementStatus = z.infer<typeof RequirementStatusSchema>;

export const AssessmentSchema = z.object({
  requirements: z.array(
    z.object({
      id: z.string(),
      status: RequirementStatusSchema,
      /** Where in the CV this is shown, or what is missing. */
      evidence: z.string(),
    }),
  ),
  /** Two or three sentences on overall fit. */
  overall: z.string(),
  assessedAt: z.string(),
  /** acceptedKey() of the suggestions this assessment saw; differs → fit is outdated. */
  basedOn: z.string().default(""),
});
export type Assessment = z.infer<typeof AssessmentSchema>;

export const SUGGESTION_TYPES = [
  "rewrite_summary",
  "rewrite_headline",
  "rewrite_block",
  "insert_block",
  "remove_block",
  "set_tags",
  "hide_item",
  "show_item",
  "move_item",
] as const;
export const SuggestionTypeSchema = z.enum(SUGGESTION_TYPES);
export type SuggestionType = z.infer<typeof SuggestionTypeSchema>;

export const SuggestionStatusSchema = z.enum(["pending", "accepted", "rejected"]);
export type SuggestionStatus = z.infer<typeof SuggestionStatusSchema>;

export const SuggestionSchema = z.object({
  id: z.string(),
  type: SuggestionTypeSchema,
  /** Entry the change applies to (blocks, tags, hide/show/move). */
  itemId: z.string().default(""),
  /** Block to rewrite/remove. */
  blockId: z.string().default(""),
  /** insert_block: insert after this block; "" = at the start of the entry. */
  afterBlockId: z.string().default(""),
  blockType: BlockTypeSchema.default("bullet"),
  /** Proposed text for rewrite_* and insert_block. */
  text: z.string().default(""),
  /** set_tags: the complete new tag list. */
  tags: z.array(z.string()).default([]),
  /** move_item: new position within its section. */
  toIndex: z.number().int().default(0),
  rationale: z.string().default(""),
  requirementIds: z.array(z.string()).default([]),
  /** Facts the model says are not backed by the profile. */
  newClaims: z.array(z.string()).default([]),
  /** What the user stated as true when asking for this ("Add to CV"); not flagged as unsupported. */
  confirmedFacts: z.string().default(""),
  status: SuggestionStatusSchema.default("pending"),
  /** User's own version of `text` / `tags`, applied instead of the proposal. */
  editedText: z.string().nullable().default(null),
  editedTags: z.array(z.string()).nullable().default(null),
});
export type Suggestion = z.infer<typeof SuggestionSchema>;

export const APP_STATUSES = ["draft", "applied", "interview", "offer", "rejected"] as const;
export const AppStatusSchema = z.enum(APP_STATUSES);
export type AppStatus = z.infer<typeof AppStatusSchema>;

export const CoverLetterSchema = z.object({
  text: z.string(),
  generatedAt: z.string(),
});
export type CoverLetter = z.infer<typeof CoverLetterSchema>;

/** What was actually sent: frozen when the application is marked as applied. */
export const SentSnapshotSchema = z.object({
  data: ProfileDataSchema,
  coverLetter: z.string().nullable(),
  at: z.string(),
});
export type SentSnapshot = z.infer<typeof SentSnapshotSchema>;

/** One yes/no question of Quick boost; a "yes" becomes accepted CV changes. */
export const BoostQuestionSchema = z.object({
  id: z.string(),
  question: z.string(),
  /** The keyword or requirement a "yes" would cover. */
  label: z.string(),
  kind: z.enum(["keyword", "requirement"]),
  requirementId: z.string().default(""),
  answer: z.enum(["yes", "no"]).nullable().default(null),
  /** Optional detail the user adds to a "yes" (where, how, numbers). */
  details: z.string().default(""),
});
export type BoostQuestion = z.infer<typeof BoostQuestionSchema>;

export const JobStatusSchema = z.enum(["analyzing", "ready", "error"]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const JobSchema = z.object({
  id: z.string(),
  description: z.string(),
  /** Extra guidance for suggestions, e.g. "keep it concise". */
  instructions: z.string(),
  profileId: z.string().nullable(),
  profileName: z.string(),
  /** Language suggestions are written in: the profile's. */
  language: LanguageSchema,
  status: JobStatusSchema,
  /** Human-readable progress while analyzing. */
  step: z.string(),
  error: z.string().nullable(),
  analysis: JobAnalysisSchema.nullable(),
  /** Snapshot of the profile the suggestions were made against. */
  base: ProfileDataSchema.nullable(),
  assessment: AssessmentSchema.nullable(),
  suggestions: z.array(SuggestionSchema),
  appStatus: AppStatusSchema.default("draft"),
  /** Status changes, oldest first. */
  history: z.array(z.object({ status: AppStatusSchema, at: z.string() })).default([]),
  notes: z.string().default(""),
  coverLetter: CoverLetterSchema.nullable().default(null),
  sent: SentSnapshotSchema.nullable().default(null),
  /** Quick boost questions, answered and open. */
  boost: z.array(BoostQuestionSchema).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Job = z.infer<typeof JobSchema>;

export const CreateJobSchema = z.object({
  profileId: z.string(),
  description: z.string().trim().min(80, "Paste the full job description (at least a few sentences)."),
  instructions: z.string().default(""),
});
export type CreateJob = z.infer<typeof CreateJobSchema>;
