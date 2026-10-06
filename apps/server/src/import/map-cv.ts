import { z } from "zod";
import {
  LANGUAGES,
  SECTION_KINDS,
  SECTION_TITLES,
  emptyProfileData,
  newId,
  type Language,
  type ProfileData,
} from "@rb/shared";
import { generateJson } from "../chatgpt/client.ts";

/** What the model returns: the profile shape without ids/flags. All fields required to keep it unambiguous. */
const MappedItem = z.object({
  title: z.string(),
  subtitle: z.string(),
  location: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  current: z.boolean(),
  description: z.string(),
  bullets: z.array(z.string()),
  tags: z.array(z.string()),
  url: z.string(),
});

export const MappedCv = z.object({
  language: z.enum([...LANGUAGES, "other"]),
  basics: z.object({
    fullName: z.string(),
    headline: z.string(),
    email: z.string(),
    phone: z.string(),
    location: z.string(),
    links: z.array(z.object({ label: z.string(), url: z.string() })),
    summary: z.string(),
  }),
  sections: z.array(
    z.object({
      kind: z.enum(SECTION_KINDS),
      title: z.string(),
      items: z.array(MappedItem),
    }),
  ),
});
export type MappedCv = z.infer<typeof MappedCv>;

const INSTRUCTIONS = `You convert the plain text of a CV/resume into structured JSON.

Rules:
- Copy wording exactly as written. Do not rephrase, translate, summarize, fix, or invent anything. Missing values are "".
- Keep the CV's original section headings as "title". Pick the closest "kind"; anything that fits none (hobbies, references, interests, personal data, etc.) is "custom" with its original heading. Never drop content.
- Item field meaning by kind:
  experience/volunteering: title=role, subtitle=company/organisation, location=city/country. A "Skills:"/"Tech stack:"/"Technologies:" line inside an entry goes into tags (one skill per tag), not into description.
  education: title=degree together with field of study (e.g. "Master of Science, Computer Science"), subtitle=institution name, location=city/country only if written.
  skills: one item per skill group; title=group name ("" if ungrouped), tags=individual skills.
  languages: one item per language; title=language, subtitle=level as written.
  certifications/awards: title=name, subtitle=issuer; date in startDate.
  projects/publications: title=name, subtitle=role or venue; technologies in tags.
- Achievement/responsibility lines become "bullets" (without bullet symbols). Running prose goes in "description".
- Dates: use "YYYY-MM" when month and year are clear, "YYYY" when only the year is known, otherwise keep the text as written. Ongoing roles ("present", "heute", "bis jetzt") set current=true and endDate="".
- The text was extracted from a PDF/DOCX, so columns may be interleaved and line breaks may be wrong. Reassemble lines that belong together.
- basics.links: label each link by what it is ("LinkedIn", "GitHub", "Portfolio", "Website", ...). Do not repeat email or phone as links.
- basics.headline is the professional title under the name, if any. basics.summary is the profile/summary paragraph, if any.
- language: the main language of the CV ("en", "de", or "other").`;

export async function mapCvText(text: string): Promise<MappedCv> {
  return generateJson(MappedCv, { name: "cv_profile", instructions: INSTRUCTIONS, input: text });
}

/** Adds ids/flags and falls back to default section titles. */
export function toProfileData(mapped: MappedCv, language: Language): ProfileData {
  return {
    basics: mapped.basics,
    sections: mapped.sections.map((s) => ({
      id: newId(),
      kind: s.kind,
      title: s.title.trim() || SECTION_TITLES[language][s.kind],
      hidden: false,
      items: s.items.map((i) => ({ ...i, id: newId(), hidden: false })),
    })),
  };
}

/** Heuristic language guess used when AI mapping is unavailable. */
export function guessLanguage(text: string): Language {
  const words = text.toLowerCase().match(/\p{L}+/gu) ?? [];
  const de = new Set(["und", "der", "die", "das", "mit", "für", "von", "bei", "berufserfahrung", "ausbildung", "kenntnisse", "sprachen", "seit", "bis"]);
  const en = new Set(["and", "the", "with", "for", "of", "at", "experience", "education", "skills", "languages", "since", "to"]);
  let score = 0;
  for (const w of words) {
    if (de.has(w)) score++;
    else if (en.has(w)) score--;
  }
  return score > 0 ? "de" : "en";
}

export function fallbackDraft(language: Language): ProfileData {
  return emptyProfileData(language);
}
