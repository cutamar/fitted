/**
 * "What an ATS sees": extracts plain text from a generated file the way parsers
 * do and verifies every important piece of the CV survived, in order.
 */
import { CV_LABELS, formatCvDateRange, normalizeForMatch, type Language, type ProfileData } from "@rb/shared";
import { extractText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";
import { normalizeText } from "../import/extract.ts";

export interface ExpectedElement {
  label: string;
  text: string;
}

export interface AtsReport {
  format: "pdf" | "docx";
  ok: boolean;
  pages: number | null;
  total: number;
  found: number;
  missing: ExpectedElement[];
  /** Section headings appear in the same order as in the CV. */
  orderOk: boolean;
  /** The extracted plain text. */
  text: string;
}

const firstWords = (text: string, n = 10) => text.trim().split(/\s+/).slice(0, n).join(" ");

export function expectedElements(data: ProfileData, language: Language): { elements: ExpectedElement[]; headings: string[] } {
  const { basics } = data;
  const el: ExpectedElement[] = [];
  const add = (label: string, text: string) => text.trim() && el.push({ label, text: text.trim() });

  add("Name", basics.fullName);
  add("Headline", basics.headline);
  add("Email", basics.email);
  add("Phone", basics.phone);
  add("Location", basics.location);
  for (const l of basics.links) add(`Link: ${l.label || "link"}`, l.url);

  const headings: string[] = [];
  if (basics.summary) {
    headings.push(CV_LABELS[language].summary);
    add("Summary heading", CV_LABELS[language].summary);
    add("Summary", firstWords(basics.summary));
  }

  for (const s of data.sections) {
    if (s.hidden || !s.items.some((i) => !i.hidden)) continue;
    headings.push(s.title);
    add("Section heading", s.title);
    for (const i of s.items) {
      if (i.hidden) continue;
      const ctx = [i.title, i.subtitle].filter(Boolean).join(" @ ") || s.title;
      add(`${s.title}: title`, i.title);
      add(`${ctx}: ${s.kind === "experience" ? "company" : "subtitle"}`, i.subtitle);
      add(`${ctx}: dates`, formatCvDateRange(i.startDate, i.endDate, i.current, language));
      for (const b of i.content) add(`${ctx}: ${b.type === "bullet" ? "bullet" : "text"}`, firstWords(b.text));
      for (const t of i.tags) add(`${ctx}: skill`, t);
    }
  }
  return { elements: el, headings };
}

async function extract(format: "pdf" | "docx", bytes: Uint8Array): Promise<{ text: string; pages: number | null }> {
  if (format === "pdf") {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(pdf, { mergePages: true });
    return { text: normalizeText(text), pages: pdf.numPages };
  }
  const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
  return { text: normalizeText(value), pages: null };
}

export async function checkExport(format: "pdf" | "docx", bytes: Uint8Array, data: ProfileData, language: Language): Promise<AtsReport> {
  const { text, pages } = await extract(format, bytes);
  const hay = normalizeForMatch(text);
  const { elements, headings } = expectedElements(data, language);
  const missing = elements.filter((e) => !hay.includes(normalizeForMatch(e.text)));

  let last = -1;
  let orderOk = true;
  for (const h of headings) {
    const pos = hay.indexOf(normalizeForMatch(h), last + 1);
    if (pos === -1) continue; // already reported as missing
    if (pos < last) orderOk = false;
    last = pos;
  }

  return { format, ok: missing.length === 0 && orderOk, pages, total: elements.length, found: elements.length - missing.length, missing, orderOk, text };
}
