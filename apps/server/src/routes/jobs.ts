import { Hono } from "hono";
import { z } from "zod";
import { CreateJobSchema, SuggestionStatusSchema, acceptedKey, applySuggestions, newId, type Job } from "@rb/shared";
import { assess, analyzeJob, assessAndSuggest, regenerateSuggestion } from "../jobs/job-ai.ts";
import { deleteJob, failInterruptedJobs, getJob, insertJob, listJobs, updateJob } from "../jobs/store.ts";
import { HttpError } from "../errors.ts";
import { getProfile } from "./profiles.ts";

failInterruptedJobs();

const running = new Set<string>();

/** Runs analysis → assessment + suggestions in the background, recording progress on the job. */
function startAnalysis(job: Job): void {
  if (running.has(job.id)) return;
  running.add(job.id);
  void (async () => {
    try {
      const base = job.base!;
      updateJob(job.id, { status: "analyzing", step: "Reading the job ad", error: null });
      const analysis = await analyzeJob(job.description, job.language);
      updateJob(job.id, { analysis, step: "Comparing with your CV and drafting suggestions" });
      const { assessment, suggestions } = await assessAndSuggest(base, analysis, job.language, job.instructions);
      updateJob(job.id, { assessment, suggestions, status: "ready", step: "" });
    } catch (err) {
      console.error(`Analysis of job ${job.id} failed`, err);
      updateJob(job.id, { status: "error", error: (err as Error).message, step: "" });
    } finally {
      running.delete(job.id);
    }
  })();
}

function requireJob(id: string): Job {
  const job = getJob(id);
  if (!job) throw new HttpError(404, "Job not found");
  return job;
}

export const jobRoutes = new Hono()
  .get("/", (c) => c.json(listJobs()))
  .post("/", async (c) => {
    const input = CreateJobSchema.parse(await c.req.json());
    const profile = getProfile(input.profileId);
    if (!profile) return c.json({ error: "Profile not found" }, 404);
    const now = new Date().toISOString();
    const job: Job = {
      id: newId(),
      description: input.description,
      instructions: input.instructions,
      profileId: profile.id,
      profileName: profile.name,
      language: profile.language,
      status: "analyzing",
      step: "Starting",
      error: null,
      analysis: null,
      base: profile.data,
      assessment: null,
      suggestions: [],
      createdAt: now,
      updatedAt: now,
    };
    insertJob(job);
    startAnalysis(job);
    return c.json(job, 201);
  })
  .get("/:id", (c) => c.json(requireJob(c.req.param("id"))))
  .delete("/:id", (c) => {
    deleteJob(c.req.param("id"));
    return c.body(null, 204);
  })
  /** Re-run everything, optionally against the latest version of the profile. */
  .post("/:id/analyze", async (c) => {
    const job = requireJob(c.req.param("id"));
    const body = z.object({ refreshProfile: z.boolean().default(false), instructions: z.string().optional() }).parse(await c.req.json().catch(() => ({})));
    let base = job.base;
    if (body.refreshProfile || !base) {
      const profile = job.profileId ? getProfile(job.profileId) : null;
      if (!profile) return c.json({ error: "The profile of this job no longer exists." }, 409);
      base = profile.data;
    }
    const next = updateJob(job.id, {
      base,
      instructions: body.instructions ?? job.instructions,
      status: "analyzing",
      step: "Starting",
      error: null,
      assessment: null,
      suggestions: [],
    })!;
    startAnalysis(next);
    return c.json(next);
  })
  /** Re-assess requirement fit on the CV with all accepted suggestions applied. */
  .post("/:id/assess", async (c) => {
    const job = requireJob(c.req.param("id"));
    if (!job.analysis || !job.base) return c.json({ error: "Analyze the job first." }, 409);
    const accepted = job.suggestions.filter((s) => s.status === "accepted");
    const assessment = { ...(await assess(applySuggestions(job.base, accepted).data, job.analysis)), basedOn: acceptedKey(job.suggestions) };
    return c.json(updateJob(job.id, { assessment }));
  })
  .patch("/:id/suggestions/:sid", async (c) => {
    const job = requireJob(c.req.param("id"));
    const patch = z
      .object({
        status: SuggestionStatusSchema.optional(),
        editedText: z.string().nullable().optional(),
        editedTags: z.array(z.string()).nullable().optional(),
      })
      .parse(await c.req.json());
    const sid = c.req.param("sid");
    if (!job.suggestions.some((s) => s.id === sid)) return c.json({ error: "Suggestion not found" }, 404);
    const suggestions = job.suggestions.map((s) => (s.id === sid ? { ...s, ...patch } : s));
    return c.json(updateJob(job.id, { suggestions }));
  })
  /** Bulk status change, e.g. "accept all pending". */
  .post("/:id/suggestions/bulk", async (c) => {
    const job = requireJob(c.req.param("id"));
    const { ids, status } = z.object({ ids: z.array(z.string()), status: SuggestionStatusSchema }).parse(await c.req.json());
    const set = new Set(ids);
    return c.json(updateJob(job.id, { suggestions: job.suggestions.map((s) => (set.has(s.id) ? { ...s, status } : s)) }));
  })
  .post("/:id/suggestions/:sid/regenerate", async (c) => {
    const job = requireJob(c.req.param("id"));
    const { instruction } = z.object({ instruction: z.string().default("") }).parse(await c.req.json().catch(() => ({})));
    const original = job.suggestions.find((s) => s.id === c.req.param("sid"));
    if (!original) return c.json({ error: "Suggestion not found" }, 404);
    if (!job.analysis || !job.base) return c.json({ error: "Analyze the job first." }, 409);
    const next = await regenerateSuggestion(job.base, job.analysis, job.language, original, instruction);
    if (!next) return c.json({ error: "ChatGPT returned an unusable suggestion. Try rephrasing your feedback." }, 502);
    // Re-read: the user may have changed other suggestions while this ran.
    const fresh = requireJob(job.id);
    return c.json(updateJob(job.id, { suggestions: fresh.suggestions.map((s) => (s.id === next.id ? next : s)) }));
  });
