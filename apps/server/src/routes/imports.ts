import { Hono } from "hono";
import { LanguageSchema, ProfileDataSchema, newId, type ImportRecord, type Language, type ProfileData } from "@rb/shared";
import { NotConnectedError } from "../chatgpt/auth.ts";
import { db } from "../db.ts";
import { MAX_UPLOAD_BYTES, detectFileType, extractCvText } from "../import/extract.ts";
import { fallbackDraft, guessLanguage, mapCvText, toProfileData } from "../import/map-cv.ts";

interface ImportRow {
  id: string;
  file_name: string;
  text: string;
  status: string;
  error: string | null;
  detected_language: string;
  draft: string;
  created_at: string;
}

function fromRow(row: ImportRow): ImportRecord {
  return {
    id: row.id,
    fileName: row.file_name,
    text: row.text,
    status: row.status as ImportRecord["status"],
    error: row.error,
    detectedLanguage: LanguageSchema.catch("en").parse(row.detected_language),
    draft: ProfileDataSchema.parse(JSON.parse(row.draft)),
    createdAt: row.created_at,
  };
}

export const importRoutes = new Hono()
  .post("/", async (c) => {
    const form = await c.req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return c.json({ error: "No file uploaded." }, 400);
    if (file.size > MAX_UPLOAD_BYTES) return c.json({ error: "File is larger than 10 MB." }, 413);

    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = detectFileType(file.name, file.type, bytes);
    if (!type) return c.json({ error: "Only PDF and DOCX files are supported." }, 415);

    let text: string;
    try {
      text = await extractCvText(type, bytes);
    } catch (err) {
      console.error("Text extraction failed", err);
      return c.json({ error: "Could not read text from this file. Is it a scanned image or password protected?" }, 422);
    }
    if (text.length < 20) {
      return c.json({ error: "Almost no text found. Scanned/image-only PDFs aren't supported yet." }, 422);
    }

    // AI mapping is best-effort: if it fails, the user still gets the text and an empty editor.
    let language: Language = guessLanguage(text);
    let draft: ProfileData = fallbackDraft(language);
    let status: ImportRecord["status"] = "unmapped";
    let error: string | null = null;
    try {
      const mapped = await mapCvText(text);
      if (mapped.language !== "other") language = mapped.language;
      draft = toProfileData(mapped, language);
      status = "mapped";
    } catch (err) {
      error = err instanceof NotConnectedError ? "Connect ChatGPT to map the CV automatically." : (err as Error).message;
      console.error("CV mapping failed", err);
    }

    const id = newId();
    db.prepare(
      "INSERT INTO imports (id, file_name, text, status, error, detected_language, draft, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(id, file.name, text, status, error, language, JSON.stringify(draft), new Date().toISOString());
    const row = db.prepare("SELECT * FROM imports WHERE id = ?").get(id) as unknown as ImportRow;
    return c.json(fromRow(row), 201);
  })
  .get("/:id", (c) => {
    const row = db.prepare("SELECT * FROM imports WHERE id = ?").get(c.req.param("id")) as ImportRow | undefined;
    return row ? c.json(fromRow(row)) : c.json({ error: "Import not found" }, 404);
  })
  .delete("/:id", (c) => {
    db.prepare("DELETE FROM imports WHERE id = ?").run(c.req.param("id"));
    return c.body(null, 204);
  });
