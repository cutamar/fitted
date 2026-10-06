import { JobSchema, type Job } from "@rb/shared";
import { db } from "../db.ts";

interface JobRow {
  id: string;
  description: string;
  instructions: string;
  profile_id: string | null;
  profile_name: string;
  language: string;
  status: string;
  step: string;
  error: string | null;
  analysis: string | null;
  base: string | null;
  assessment: string | null;
  suggestions: string;
  app_status: string;
  history: string;
  notes: string;
  cover_letter: string | null;
  sent: string | null;
  boost: string;
  created_at: string;
  updated_at: string;
}

const parse = (v: string | null) => (v ? JSON.parse(v) : null);

function fromRow(r: JobRow): Job {
  return JobSchema.parse({
    id: r.id,
    description: r.description,
    instructions: r.instructions,
    profileId: r.profile_id,
    profileName: r.profile_name,
    language: r.language,
    status: r.status,
    step: r.step,
    error: r.error,
    analysis: parse(r.analysis),
    base: parse(r.base),
    assessment: parse(r.assessment),
    suggestions: JSON.parse(r.suggestions),
    appStatus: r.app_status,
    history: JSON.parse(r.history),
    notes: r.notes,
    coverLetter: parse(r.cover_letter),
    sent: parse(r.sent),
    boost: JSON.parse(r.boost),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  });
}

export function getJob(id: string): Job | null {
  const row = db.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as JobRow | undefined;
  return row ? fromRow(row) : null;
}

export function listJobs(): Job[] {
  return (db.prepare("SELECT * FROM jobs ORDER BY created_at DESC").all() as unknown as JobRow[]).map(fromRow);
}

export function insertJob(job: Job): void {
  db.prepare(
    `INSERT INTO jobs (id, description, instructions, profile_id, profile_name, language, status, step, error, analysis, base, assessment, suggestions, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    job.id,
    job.description,
    job.instructions,
    job.profileId,
    job.profileName,
    job.language,
    job.status,
    job.step,
    job.error,
    job.analysis && JSON.stringify(job.analysis),
    job.base && JSON.stringify(job.base),
    job.assessment && JSON.stringify(job.assessment),
    JSON.stringify(job.suggestions),
    job.createdAt,
    job.updatedAt,
  );
}

const COLUMNS: Record<string, string> = {
  instructions: "instructions",
  status: "status",
  step: "step",
  error: "error",
  analysis: "analysis",
  base: "base",
  assessment: "assessment",
  suggestions: "suggestions",
  appStatus: "app_status",
  history: "history",
  notes: "notes",
  coverLetter: "cover_letter",
  sent: "sent",
  boost: "boost",
};

type JobPatch = Partial<
  Pick<Job, "instructions" | "status" | "step" | "error" | "analysis" | "base" | "assessment" | "suggestions" | "appStatus" | "history" | "notes" | "coverLetter" | "sent" | "boost">
>;

export function updateJob(id: string, patch: JobPatch): Job | null {
  const entries = Object.entries(patch).filter(([k]) => k in COLUMNS);
  if (entries.length) {
    const sets = entries.map(([k]) => `${COLUMNS[k]} = ?`).join(", ");
    const values = entries.map(([, v]) => (v !== null && typeof v === "object" ? JSON.stringify(v) : (v as string | null)));
    db.prepare(`UPDATE jobs SET ${sets}, updated_at = ? WHERE id = ?`).run(...values, new Date().toISOString(), id);
  }
  return getJob(id);
}

export function deleteJob(id: string): void {
  db.prepare("DELETE FROM jobs WHERE id = ?").run(id);
}

/** Analyses don't survive a restart; mark them so the user can retry. */
export function failInterruptedJobs(): void {
  db.prepare("UPDATE jobs SET status = 'error', error = 'Interrupted by a restart. Run the analysis again.' WHERE status = 'analyzing'").run();
}
