import type { Language, SectionKind } from "./profile.ts";

export const LANGUAGE_NAMES: Record<Language, string> = {
  en: "English",
  de: "Deutsch",
};

/** Default section headings, written in the CV's language. */
export const SECTION_TITLES: Record<Language, Record<SectionKind, string>> = {
  en: {
    experience: "Work Experience",
    education: "Education",
    skills: "Skills",
    languages: "Languages",
    certifications: "Certifications",
    projects: "Projects",
    volunteering: "Volunteering",
    awards: "Awards",
    publications: "Publications",
    custom: "Additional Information",
  },
  de: {
    experience: "Berufserfahrung",
    education: "Ausbildung",
    skills: "Kenntnisse",
    languages: "Sprachen",
    certifications: "Zertifikate",
    projects: "Projekte",
    volunteering: "Ehrenamt",
    awards: "Auszeichnungen",
    publications: "Publikationen",
    custom: "Weitere Angaben",
  },
};

export interface KindMeta {
  /** Name of the kind in the (English) app UI. */
  label: string;
  /** UI labels for the generic item fields; null hides the field by default. */
  fields: {
    title: string;
    subtitle: string | null;
    location: string | null;
    dates: boolean;
    /** Paragraph / bullet blocks. */
    content: boolean;
    tags: string | null;
    url: boolean;
  };
}

export const KIND_META: Record<SectionKind, KindMeta> = {
  experience: {
    label: "Work experience",
    fields: { title: "Role", subtitle: "Company", location: "Location", dates: true, content: true, tags: "Skills used", url: false },
  },
  education: {
    label: "Education",
    fields: { title: "Degree / programme", subtitle: "Institution", location: "Location", dates: true, content: true, tags: null, url: false },
  },
  skills: {
    label: "Skills",
    fields: { title: "Group (e.g. Tools)", subtitle: null, location: null, dates: false, content: false, tags: "Skills", url: false },
  },
  languages: {
    label: "Languages",
    fields: { title: "Language", subtitle: "Level (e.g. C1, native)", location: null, dates: false, content: false, tags: null, url: false },
  },
  certifications: {
    label: "Certifications",
    fields: { title: "Certificate", subtitle: "Issuer", location: null, dates: true, content: true, tags: null, url: true },
  },
  projects: {
    label: "Projects",
    fields: { title: "Project", subtitle: "Role / context", location: null, dates: true, content: true, tags: "Technologies", url: true },
  },
  volunteering: {
    label: "Volunteering",
    fields: { title: "Role", subtitle: "Organisation", location: "Location", dates: true, content: true, tags: null, url: false },
  },
  awards: {
    label: "Awards",
    fields: { title: "Award", subtitle: "Awarded by", location: null, dates: true, content: true, tags: null, url: false },
  },
  publications: {
    label: "Publications",
    fields: { title: "Title", subtitle: "Publisher / venue", location: null, dates: true, content: true, tags: null, url: true },
  },
  custom: {
    label: "Custom",
    fields: { title: "Title", subtitle: "Subtitle", location: "Location", dates: true, content: true, tags: "Tags", url: true },
  },
};

const MONTHS: Record<Language, string[]> = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  de: ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sep.", "Okt.", "Nov.", "Dez."],
};

const PRESENT: Record<Language, string> = { en: "Present", de: "heute" };

/** "2021-04" → "Apr 2021" / "Apr. 2021"; other formats are returned as written. */
export function formatCvDate(value: string, language: Language): string {
  const m = value.trim().match(/^(\d{4})-(\d{2})$/);
  if (!m) return value.trim();
  const month = MONTHS[language][Number(m[2]) - 1];
  return month ? `${month} ${m[1]}` : m[1]!;
}

export function formatCvDateRange(start: string, end: string, current: boolean, language: Language): string {
  const from = formatCvDate(start, language);
  const to = current ? PRESENT[language] : formatCvDate(end, language);
  if (from && to) return `${from} – ${to}`;
  return from || to;
}

/** Fixed words printed on the CV itself, in the CV's language. */
export const CV_LABELS: Record<Language, { tags: string; summary: string }> = {
  en: { tags: "Skills", summary: "Profile" },
  de: { tags: "Kenntnisse", summary: "Profil" },
};
