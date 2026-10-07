import { Hono, type Context } from "hono";
import { z } from "zod";
import { AppStatusSchema, computeScore, newId, unsupportedClaims, CreateJobSchema, SuggestionSchema, SuggestionStatusSchema, type Suggestion, acceptedKey, applySuggestions, tailoredData, type Job } from "@rb/shared";
import { assess, analyzeJob, assessAndSuggest, boostQuestions, boostSuggestions, regenerateSuggestion, suggestForGap, suggestForKeywords, writeCoverLetter, type BoostGap } from "../jobs/job-ai.ts";
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
      appStatus: "draft",
      history: [],
      notes: "",
      coverLetter: null,
      sent: null,
      boost: [],
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
  /** Tracking: status and notes. Marking as applied freezes what was sent. */
  .patch("/:id/tracking", async (c) => {
    const job = requireJob(c.req.param("id"));
    const body = z.object({ appStatus: AppStatusSchema.optional(), notes: z.string().optional() }).parse(await c.req.json());
    const patch: Parameters<typeof updateJob>[1] = {};
    if (body.notes !== undefined) patch.notes = body.notes;
    if (body.appStatus && body.appStatus !== job.appStatus) {
      patch.appStatus = body.appStatus;
      patch.history = [...job.history, { status: body.appStatus, at: new Date().toISOString() }];
      if (body.appStatus === "applied" && job.base) {
        patch.sent = { data: tailoredData(job.base, job.suggestions), coverLetter: job.coverLetter?.text ?? null, at: new Date().toISOString() };
      }
    }
    return c.json(updateJob(job.id, patch));
  })
  .post("/:id/cover-letter", async (c) => {
    const job = requireJob(c.req.param("id"));
    if (!job.analysis || !job.base) return c.json({ error: "Analyze the job first." }, 409);
    const { instructions } = z.object({ instructions: z.string().default("") }).parse(await c.req.json().catch(() => ({})));
    const text = await writeCoverLetter(tailoredData(job.base, job.suggestions), job.analysis, job.language, instructions);
    return c.json(updateJob(job.id, { coverLetter: { text, generatedAt: new Date().toISOString() } }));
  })
  .put("/:id/cover-letter", async (c) => {
    const job = requireJob(c.req.param("id"));
    const { text } = z.object({ text: z.string() }).parse(await c.req.json());
    return c.json(updateJob(job.id, { coverLetter: { text, generatedAt: job.coverLetter?.generatedAt ?? new Date().toISOString() } }));
  })
  /** "Add to CV" for a requirement or keyword: one new suggestion, appended. */
  .post("/:id/suggestions/add", async (c) => {
    const job = requireJob(c.req.param("id"));
    if (!job.analysis || !job.base) return c.json({ error: "Analyze the job first." }, 409);
    const body = z
      .object({
        requirementId: z.string().optional(),
        keyword: z.string().optional(),
        keywords: z.array(z.string().trim().min(1)).optional(),
        details: z.string().default(""),
        itemId: z.string().optional(),
      })
      .parse(await c.req.json());
    // Against the tailored CV, so it builds on accepted changes instead of undoing them.
    const current = tailoredData(job.base, job.suggestions);
    const req = body.requirementId ? job.analysis.requirements.find((r) => r.id === body.requirementId) : undefined;
    const keywords = [...new Set([...(body.keywords ?? []), ...(body.keyword ? [body.keyword] : [])])];
    if (!req && !keywords.length) return c.json({ error: "Pick a requirement or at least one keyword." }, 400);

    let added: Suggestion[] = [];
    const target = body.itemId ? current.sections.flatMap((s) => s.items).find((i) => i.id === body.itemId) : undefined;
    if (!req && target && !body.details.trim()) {
      // Keywords into a chosen tag list with no extra story: append directly, no ChatGPT call needed.
      const have = new Set(target.tags.map((t) => t.toLowerCase()));
      const fresh = keywords.filter((k) => !have.has(k.toLowerCase()));
      if (!fresh.length) return c.json({ error: "Those keywords are already in that list." }, 409);
      added = [
        SuggestionSchema.parse({
          id: newId(),
          type: "set_tags",
          itemId: target.id,
          tags: [...target.tags, ...fresh],
          rationale: `Adds ${fresh.join(", ")} where you chose.`,
          confirmedFacts: `User added: ${fresh.join(", ")}`,
        }),
      ];
    } else if (!req && keywords.length > 1) {
      added = await suggestForKeywords(current, job.analysis, job.language, keywords, body.details, body.itemId);
    } else {
      const s = await suggestForGap(current, job.analysis, job.language, {
        label: req?.text ?? keywords[0]!,
        kind: req ? "requirement" : "keyword",
        requirementId: req?.id,
        details: body.details,
        itemId: body.itemId,
      });
      if (s) added = [s];
    }
    if (!added.length) return c.json({ error: "ChatGPT couldn't place it. Try adding a sentence about where you used it." }, 502);
    const fresh = requireJob(job.id);
    return c.json({ job: updateJob(job.id, { suggestions: [...fresh.suggestions, ...added] }), suggestionId: added[0]!.id, suggestionIds: added.map((s) => s.id) });
  })
  /** Quick boost, step 1: yes/no questions for the biggest remaining gaps. */
  .post("/:id/boost", async (c) => {
    const job = requireJob(c.req.param("id"));
    if (!job.analysis || !job.base) return c.json({ error: "Analyze the job first." }, 409);
    const current = tailoredData(job.base, job.suggestions);
    const score = computeScore(current, job.analysis, job.assessment);
    // Never ask about something already answered (by wording or by requirement).
    const answered = job.boost.filter((q) => q.answer);
    const asked = new Set([...answered.map((q) => q.label.toLowerCase()), ...answered.map((q) => q.requirementId).filter(Boolean)]);
    const status = new Map(job.assessment?.requirements.map((r) => [r.id, r.status]));
    const gaps: BoostGap[] = [
      ...job.analysis.requirements
        .filter((r) => status.get(r.id) !== "met")
        .sort((a, b) => Number(b.mustHave) - Number(a.mustHave))
        .map((r) => ({ label: r.text, kind: "requirement" as const, requirementId: r.id, weight: `${r.mustHave ? "must-have" : "nice-to-have"}, ${status.get(r.id) ?? "missing"}` })),
      ...score.keywords.missing
        .sort((a, b) => ["high", "medium", "low"].indexOf(a.importance) - ["high", "medium", "low"].indexOf(b.importance))
        .map((k) => ({ label: k.term, kind: "keyword" as const, weight: `${k.importance}-importance keyword` })),
    ].filter((g: BoostGap) => !asked.has(g.label.toLowerCase()) && !(g.requirementId && asked.has(g.requirementId)));
    if (!gaps.length) return c.json({ error: "Nothing left to ask: every requirement and keyword is covered or already answered." }, 409);
    const questions = (await boostQuestions(current, job.analysis, gaps)).map((q) => {
      const g = gaps[q.gapIndex]!;
      return { id: newId(), question: q.question.trim(), label: g.label, kind: g.kind, requirementId: g.requirementId ?? "", answer: null, details: "" };
    });
    // Keep answered questions (history), replace open ones with the new set.
    return c.json(updateJob(job.id, { boost: [...job.boost.filter((q) => q.answer), ...questions] }));
  })
  /** Quick boost, step 2: turn "yes" answers into accepted changes; optionally accept safe open suggestions. */
  .post("/:id/boost/apply", async (c) => {
    const job = requireJob(c.req.param("id"));
    if (applying.has(job.id)) return c.json({ error: "Your CV is already being updated. Wait a moment, then reload." }, 409);
    applying.add(job.id);
    try {
      return await applyBoost(c, job);
    } finally {
      applying.delete(job.id);
    }
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

const applying = new Set<string>();

async function applyBoost(c: Context, job: Job) {
    if (!job.analysis || !job.base) return c.json({ error: "Analyze the job first." }, 409);
    const body = z
      .object({
        answers: z.array(z.object({ id: z.string(), answer: z.enum(["yes", "no"]), details: z.string().default("") })),
        acceptSafe: z.boolean().default(true),
      })
      .parse(await c.req.json());
    const byId = new Map(body.answers.map((a) => [a.id, a]));
    const boost = job.boost.map((q) => (byId.has(q.id) ? { ...q, answer: byId.get(q.id)!.answer, details: byId.get(q.id)!.details.trim() } : q));
    const yes = boost.filter((q) => byId.has(q.id) && q.answer === "yes");

    let suggestions = job.suggestions;
    let acceptedSafe = 0;
    if (body.acceptSafe) {
      const context = tailoredData(job.base, suggestions);
      suggestions = suggestions.map((s) => {
        if (s.status !== "pending" || unsupportedClaims(s, job.base!, job.analysis!, context).length) return s;
        acceptedSafe++;
        return { ...s, status: "accepted" as const };
      });
    }
    let added: typeof suggestions = [];
    if (yes.length) {
      const started = Date.now();
      added = await boostSuggestions(
        tailoredData(job.base, suggestions),
        job.analysis,
        job.language,
        yes.map((q) => ({
          label: q.label,
          requirementId: q.requirementId || undefined,
          statement: `${q.question} Yes.${q.details ? ` User's detail: ${q.details}` : ""}`,
        })),
      );
      console.log(`Quick boost: ${yes.length} yes answers -> ${added.length} changes in ${Math.round((Date.now() - started) / 1000)}s`);
      added = added.map((s) => (s.requirementIds.length ? s : { ...s, requirementIds: [...new Set(yes.map((q) => q.requirementId).filter(Boolean))] }));
    }
    const fresh = requireJob(job.id);
    const merged = [...suggestions.filter((s) => fresh.suggestions.some((f) => f.id === s.id)), ...added];
    return c.json({ job: updateJob(job.id, { boost, suggestions: merged }), added: added.length, acceptedSafe });
}
