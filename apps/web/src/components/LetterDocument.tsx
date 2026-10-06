import type { Basics, Language } from "@rb/shared";

export interface LetterData {
  basics: Basics;
  language: Language;
  text: string;
  company: string;
  date: string;
}

export function formatLetterDate(iso: string, language: Language) {
  return new Date(iso).toLocaleDateString(language === "de" ? "de-CH" : "en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/** Cover letter page, same typography as the CV. */
export function LetterDocument({ letter }: { letter: LetterData }) {
  const b = letter.basics;
  return (
    <div className="font-cv text-[11pt] leading-[1.55] text-[#1d1d24]" style={{ fontVariantLigatures: "none", fontFeatureSettings: '"liga" 0, "calt" 0' }}>
      <div className="text-[18pt] font-bold tracking-tight">{b.fullName}</div>
      {b.headline && <div className="text-[#4f46e5]">{b.headline}</div>}
      <div className="mt-1 text-[9.5pt] text-[#55556a]">{[b.location, b.phone, b.email].filter(Boolean).join("  ·  ")}</div>
      <div className="mt-8">{letter.company}</div>
      <div className="mt-1 mb-8">{formatLetterDate(letter.date, letter.language)}</div>
      {letter.text.split(/\n\s*\n/).map((p, i) => (
        <p key={i} className="mb-3 whitespace-pre-line">
          {p}
        </p>
      ))}
    </div>
  );
}
