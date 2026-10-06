import { SECTION_TITLES } from "./i18n.ts";
import type { Item, Language, ProfileData, Section, SectionKind } from "./profile.ts";

export function newId(): string {
  return crypto.randomUUID();
}

export function emptyItem(): Item {
  return {
    id: newId(),
    title: "",
    subtitle: "",
    location: "",
    startDate: "",
    endDate: "",
    current: false,
    description: "",
    bullets: [],
    tags: [],
    url: "",
    hidden: false,
  };
}

export function emptySection(kind: SectionKind, language: Language): Section {
  return { id: newId(), kind, title: SECTION_TITLES[language][kind], hidden: false, items: [] };
}

export function emptyProfileData(language: Language): ProfileData {
  return {
    basics: { fullName: "", headline: "", email: "", phone: "", location: "", links: [], summary: "" },
    sections: (["experience", "education", "skills", "languages"] as const).map((k) => emptySection(k, language)),
  };
}

/** Deep copy with fresh ids, used when duplicating a profile. */
export function cloneProfileData(data: ProfileData): ProfileData {
  return {
    basics: structuredClone(data.basics),
    sections: data.sections.map((s) => ({
      ...structuredClone(s),
      id: newId(),
      items: s.items.map((i) => ({ ...structuredClone(i), id: newId() })),
    })),
  };
}
