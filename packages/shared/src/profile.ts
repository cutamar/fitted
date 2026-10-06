import { z } from "zod";

/** CV languages. Adding one means adding it here and its labels in i18n.ts. */
export const LANGUAGES = ["en", "de"] as const;
export const LanguageSchema = z.enum(LANGUAGES);
export type Language = z.infer<typeof LanguageSchema>;

/**
 * Section kinds only drive defaults (title, field labels, export layout).
 * Every section shares the same generic item shape, so anything that does not
 * fit a known kind can live in a "custom" section without losing data.
 */
export const SECTION_KINDS = [
  "experience",
  "education",
  "skills",
  "languages",
  "certifications",
  "projects",
  "volunteering",
  "awards",
  "publications",
  "custom",
] as const;
export const SectionKindSchema = z.enum(SECTION_KINDS);
export type SectionKind = z.infer<typeof SectionKindSchema>;

export const LinkSchema = z.object({
  label: z.string().default(""),
  url: z.string().default(""),
});
export type Link = z.infer<typeof LinkSchema>;

export const BLOCK_TYPES = ["text", "bullet"] as const;
export const BlockTypeSchema = z.enum(BLOCK_TYPES);
export type BlockType = z.infer<typeof BlockTypeSchema>;

/**
 * One paragraph or one bullet point. An entry's body is an ordered list of
 * blocks, so any mix works: only prose, only bullets, prose → bullets → prose.
 * Consecutive bullets render as one list.
 */
export const BlockSchema = z.object({
  id: z.string(),
  type: BlockTypeSchema,
  text: z.string().default(""),
});
export type Block = z.infer<typeof BlockSchema>;

/** Converts the earlier description + bullets shape into blocks. */
function upgradeLegacyItem(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || "content" in raw) return raw;
  const { description, bullets, ...rest } = raw as { description?: unknown; bullets?: unknown };
  const content: Block[] = [];
  if (typeof description === "string" && description.trim()) {
    content.push({ id: crypto.randomUUID(), type: "text", text: description });
  }
  if (Array.isArray(bullets)) {
    for (const b of bullets) if (typeof b === "string") content.push({ id: crypto.randomUUID(), type: "bullet", text: b });
  }
  return { ...rest, content };
}

export const ItemSchema = z.preprocess(
  upgradeLegacyItem,
  z.object({
    id: z.string(),
    /** Role, degree, certificate name, language, skill group, ... */
    title: z.string().default(""),
    /** Company, institution, issuer, proficiency level, ... */
    subtitle: z.string().default(""),
    location: z.string().default(""),
    /** "YYYY-MM", "YYYY" or free text as written in the CV. */
    startDate: z.string().default(""),
    endDate: z.string().default(""),
    current: z.boolean().default(false),
    content: z.array(BlockSchema).default([]),
    tags: z.array(z.string()).default([]),
    url: z.string().default(""),
    hidden: z.boolean().default(false),
  }),
);
export type Item = z.infer<typeof ItemSchema>;

export const SectionSchema = z.object({
  id: z.string(),
  kind: SectionKindSchema,
  title: z.string(),
  hidden: z.boolean().default(false),
  items: z.array(ItemSchema).default([]),
});
export type Section = z.infer<typeof SectionSchema>;

export const BasicsSchema = z.object({
  fullName: z.string().default(""),
  headline: z.string().default(""),
  email: z.string().default(""),
  phone: z.string().default(""),
  location: z.string().default(""),
  links: z.array(LinkSchema).default([]),
  summary: z.string().default(""),
});
export type Basics = z.infer<typeof BasicsSchema>;

/** The editable content of a master profile. */
export const ProfileDataSchema = z.object({
  basics: BasicsSchema.prefault({}),
  sections: z.array(SectionSchema).default([]),
});
export type ProfileData = z.infer<typeof ProfileDataSchema>;

export const ProfileInputSchema = z.object({
  /** Label shown in the app, e.g. "Product Owner" or "Sales". */
  name: z.string().trim().min(1).max(120),
  language: LanguageSchema,
  data: ProfileDataSchema,
});
export type ProfileInput = z.infer<typeof ProfileInputSchema>;

export const ProfileSchema = ProfileInputSchema.extend({
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Profile = z.infer<typeof ProfileSchema>;
