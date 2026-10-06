import { tailoredData, type Language, type ProfileData } from "@rb/shared";
import { HttpError } from "../errors.ts";
import { getJob } from "../jobs/store.ts";
import { getProfile } from "../routes/profiles.ts";

export type ExportKind = "profile" | "job" | "sent";

export interface CvSource {
  data: ProfileData;
  language: Language;
  /** File name without extension, e.g. "Amar_Cutura_CV_Helvetia_Digital_AG". */
  fileBase: string;
}

function slug(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

/** The CV to export: a master profile, or a job's tailored version (accepted suggestions applied). */
export function resolveCv(kind: string, id: string): CvSource {
  if (kind === "profile") {
    const p = getProfile(id);
    if (!p) throw new HttpError(404, "Profile not found");
    return { data: p.data, language: p.language, fileBase: [slug(p.data.basics.fullName) || "CV", "CV"].join("_") };
  }
  if (kind === "job") {
    const job = getJob(id);
    if (!job) throw new HttpError(404, "Job not found");
    if (!job.base) throw new HttpError(409, "This application has no CV yet.");
    const data = tailoredData(job.base, job.suggestions);
    const company = job.analysis?.company ? slug(job.analysis.company) : "";
    return { data, language: job.language, fileBase: [slug(data.basics.fullName) || "CV", "CV", company].filter(Boolean).join("_") };
  }
  if (kind === "sent") {
    const job = getJob(id);
    if (!job?.sent) throw new HttpError(404, "Nothing was sent for this application yet.");
    const company = job.analysis?.company ? slug(job.analysis.company) : "";
    return { data: job.sent.data, language: job.language, fileBase: [slug(job.sent.data.basics.fullName) || "CV", "CV", company].filter(Boolean).join("_") };
  }
  throw new HttpError(400, `Unknown export kind "${kind}"`);
}

export interface LetterSource {
  basics: ProfileData["basics"];
  language: Language;
  text: string;
  company: string;
  /** ISO date printed on the letter. */
  date: string;
  fileBase: string;
}

/** A job's cover letter: the current draft, or the version frozen when applying. */
export function resolveLetter(id: string, sent: boolean): LetterSource {
  const job = getJob(id);
  if (!job?.base) throw new HttpError(404, "Job not found");
  const text = sent ? job.sent?.coverLetter : job.coverLetter?.text;
  if (!text) throw new HttpError(404, sent ? "No cover letter was sent with this application." : "Write a cover letter first.");
  const data = sent && job.sent ? job.sent.data : tailoredData(job.base, job.suggestions);
  const company = job.analysis?.company ?? "";
  return {
    basics: data.basics,
    language: job.language,
    text,
    company,
    date: sent && job.sent ? job.sent.at : new Date().toISOString(),
    fileBase: [slug(data.basics.fullName) || "Cover", "Cover_Letter", slug(company)].filter(Boolean).join("_"),
  };
}
