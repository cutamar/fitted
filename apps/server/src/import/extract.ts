import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export type SupportedFile = "pdf" | "docx";

export function detectFileType(fileName: string, mime: string, bytes: Uint8Array): SupportedFile | null {
  // %PDF magic bytes
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "pdf";
  // DOCX is a zip ("PK"); trust the name/mime for which kind of zip.
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (isZip && (/\.docx$/i.test(fileName) || mime.includes("wordprocessingml"))) return "docx";
  return null;
}

export async function extractCvText(type: SupportedFile, bytes: Uint8Array): Promise<string> {
  const raw =
    type === "pdf"
      ? (await extractText(await getDocumentProxy(bytes), { mergePages: true })).text
      : (await mammoth.extractRawText({ buffer: Buffer.from(bytes) })).value;
  return normalizeText(raw);
}

export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[   ]/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
