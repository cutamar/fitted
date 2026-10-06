import { Hono } from "hono";
import { HttpError } from "../errors.ts";
import { checkExport } from "../export/check.ts";
import { renderDocx } from "../export/docx.ts";
import { renderPdf } from "../export/pdf.ts";
import { resolveCv, type ExportKind } from "../export/source.ts";

const MIME = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
} as const;

function kindOf(kind: string): ExportKind {
  if (kind !== "profile" && kind !== "job") throw new HttpError(400, `Unknown export kind "${kind}"`);
  return kind;
}

async function render(format: "pdf" | "docx", kind: ExportKind, id: string) {
  const cv = resolveCv(kind, id);
  const bytes = format === "pdf" ? await renderPdf(kind, id) : await renderDocx(cv.data, cv.language);
  return { cv, bytes };
}

export const exportRoutes = new Hono()
  /** CV data for the /print page that Chromium turns into the PDF. */
  .get("/:kind/:id/data", (c) => {
    const cv = resolveCv(kindOf(c.req.param("kind")), c.req.param("id"));
    return c.json({ data: cv.data, language: cv.language });
  })
  .get("/:kind/:id/check", async (c) => {
    const kind = kindOf(c.req.param("kind"));
    const id = c.req.param("id");
    const reports = [];
    for (const format of ["pdf", "docx"] as const) {
      const { cv, bytes } = await render(format, kind, id);
      reports.push(await checkExport(format, bytes, cv.data, cv.language));
    }
    return c.json(reports);
  })
  .get("/:kind/:id/cv.pdf", (c) => download(c.req.param("kind"), c.req.param("id"), "pdf"))
  .get("/:kind/:id/cv.docx", (c) => download(c.req.param("kind"), c.req.param("id"), "docx"));

async function download(kind: string, id: string, format: "pdf" | "docx"): Promise<Response> {
  const { cv, bytes } = await render(format, kindOf(kind), id);
  return new Response(bytes as Uint8Array<ArrayBuffer>, {
    headers: {
      "Content-Type": MIME[format],
      "Content-Disposition": `attachment; filename="${cv.fileBase}.${format}"`,
      "Cache-Control": "no-store",
    },
  });
}
