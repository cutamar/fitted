import { Document, Packer, Paragraph, TextRun } from "docx";
import type { Language } from "@rb/shared";
import type { LetterSource } from "./source.ts";

export function formatLetterDate(iso: string, language: Language): string {
  return new Date(iso).toLocaleDateString(language === "de" ? "de-CH" : "en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/** Plain letter: sender block, date, body paragraphs. */
export async function renderLetterDocx(l: LetterSource): Promise<Uint8Array> {
  const b = l.basics;
  const contact = [b.location, b.phone, b.email].filter(Boolean).join("  ·  ");
  const doc = new Document({
    creator: b.fullName,
    title: `${b.fullName} – Cover letter`,
    styles: { default: { document: { run: { font: "Calibri", size: 22, color: "1D1D24" }, paragraph: { spacing: { line: 276 } } } } },
    sections: [
      {
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1247, right: 1247 } } },
        children: [
          new Paragraph({ children: [new TextRun({ text: b.fullName, bold: true, size: 32 })] }),
          ...(b.headline ? [new Paragraph({ children: [new TextRun({ text: b.headline, color: "4F46E5" })] })] : []),
          new Paragraph({ spacing: { after: 360 }, children: [new TextRun({ text: contact, color: "55556A", size: 19 })] }),
          ...(l.company ? [new Paragraph({ children: [new TextRun(l.company)] })] : []),
          new Paragraph({ spacing: { after: 360 }, children: [new TextRun(formatLetterDate(l.date, l.language))] }),
          ...l.text.split(/\n\s*\n/).map((p) => new Paragraph({ spacing: { after: 200 }, children: p.split("\n").map((line, i) => new TextRun({ text: line, break: i > 0 ? 1 : 0 })) })),
        ],
      },
    ],
  });
  return new Uint8Array(await Packer.toBuffer(doc));
}
