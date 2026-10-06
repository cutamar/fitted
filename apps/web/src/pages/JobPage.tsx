import { useMemo, useState } from "react";
import { ArrowLeft, Check, CheckCheck, Languages, RefreshCw, Trash2, X } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import {
  acceptedKey,
  applySuggestions,
  computeScore,
  unsupportedClaims,
  type Job,
  type JobAnalysis,
  type ProfileData,
  type RequirementStatus,
  type Suggestion,
} from "@rb/shared";
import { CvPreview } from "../components/CvPreview";
import { ExportPanel } from "../components/ExportPanel";
import { ScorePanel } from "../components/ScorePanel";
import { SuggestionCard } from "../components/SuggestionCard";
import { Badge, Button, Card, Notice, Spinner, cx } from "../components/ui";
import { useDeleteJob, useJob, useJobActions } from "../lib/api";

type Tab = "suggestions" | "requirements" | "keywords" | "ad";

export function JobPage() {
  const { id = "" } = useParams();
  const { data: job, isLoading, error } = useJob(id);
  const remove = useDeleteJob();
  const navigate = useNavigate();

  if (isLoading) return <Spinner className="text-muted" />;
  if (error || !job) return <Notice tone="error">{(error as Error)?.message ?? "Job not found"}</Notice>;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/jobs">
          <Button variant="ghost" size="icon" title="All applications">
            <ArrowLeft />
          </Button>
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{job.analysis?.title || "New application"}</h1>
          <div className="text-sm text-muted">
            {job.analysis?.company && `${job.analysis.company} · `}Tailored from <span className="font-medium text-fg">{job.profileName}</span>{" "}
            <Badge>{job.language}</Badge>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          title="Delete application"
          onClick={async () => {
            if (!confirm("Delete this application and its suggestions?")) return;
            await remove.mutateAsync(job.id);
            navigate("/jobs");
          }}
        >
          <Trash2 />
        </Button>
      </div>

      {job.status === "analyzing" && <Progress job={job} />}
      {job.status === "error" && <Failed job={job} />}
      {job.status === "ready" && job.analysis && job.base && <Workspace job={job} analysis={job.analysis} base={job.base} />}
    </div>
  );
}

const STEPS = ["Reading the job ad", "Comparing with your CV and drafting suggestions"];

function Progress({ job }: { job: Job }) {
  const current = STEPS.indexOf(job.step);
  return (
    <Card className="mx-auto w-full max-w-lg p-6">
      <div className="font-semibold">Analyzing the match</div>
      <p className="mt-1 text-sm text-muted">This usually takes 1–2 minutes. You can leave this page; it keeps running.</p>
      <ol className="mt-5 flex flex-col gap-3">
        {STEPS.map((step, i) => (
          <li key={step} className="flex items-center gap-3 text-sm">
            {i < current ? (
              <Check className="size-4 text-success" />
            ) : i === current ? (
              <Spinner className="size-4 text-accent" />
            ) : (
              <span className="size-4 rounded-full border-2 border-border" />
            )}
            <span className={cx(i > current && "text-muted")}>{step}</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function Failed({ job }: { job: Job }) {
  const { reanalyze } = useJobActions(job.id);
  return (
    <Card className="mx-auto w-full max-w-lg p-6">
      <div className="font-semibold text-danger">Analysis failed</div>
      <p className="mt-1 text-sm text-muted">{job.error}</p>
      <Button className="mt-4" variant="primary" onClick={() => reanalyze.mutate({ refreshProfile: false })} disabled={reanalyze.isPending}>
        <RefreshCw /> Try again
      </Button>
    </Card>
  );
}

function Workspace({ job, analysis, base }: { job: Job; analysis: JobAnalysis; base: ProfileData }) {
  const actions = useJobActions(job.id);
  const [tab, setTab] = useState<Tab>("suggestions");
  const [highlight, setHighlight] = useState(true);
  const [includePending, setIncludePending] = useState(false);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);

  const accepted = job.suggestions.filter((s) => s.status === "accepted");
  const pending = job.suggestions.filter((s) => s.status === "pending");

  const baseScore = useMemo(() => computeScore(base, analysis, job.assessment), [base, analysis, job.assessment]);
  const current = useMemo(() => applySuggestions(base, accepted).data, [base, accepted]);
  const currentScore = useMemo(() => computeScore(current, analysis, job.assessment), [current, analysis, job.assessment]);
  const fitStale = !!job.assessment && job.assessment.basedOn !== acceptedKey(job.suggestions);

  // Score impact of accepting each pending suggestion on top of what's accepted.
  const deltas = useMemo(() => {
    const out: Record<string, number> = {};
    for (const s of pending) out[s.id] = computeScore(applySuggestions(base, [...accepted, s]).data, analysis, job.assessment).overall - currentScore.overall;
    return out;
  }, [pending, accepted, base, analysis, job.assessment, currentScore]);

  const warnings = useMemo(() => Object.fromEntries(job.suggestions.map((s) => [s.id, unsupportedClaims(s, base, analysis)])), [job.suggestions, base, analysis]);

  const preview = useMemo(
    () => applySuggestions(base, includePending ? job.suggestions.filter((s) => s.status !== "rejected") : accepted, { keepRemoved: highlight }),
    [base, job.suggestions, accepted, includePending, highlight],
  );

  const languageMismatch = analysis.jobLanguage !== "other" && analysis.jobLanguage !== job.language;
  const safePending = pending.filter((s) => warnings[s.id]!.length === 0);

  const regenerate = (s: Suggestion, instruction: string) => {
    setRegeneratingId(s.id);
    actions.regenerate.mutate({ sid: s.id, instruction }, { onSettled: () => setRegeneratingId(null) });
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "suggestions", label: `Suggestions (${pending.length} open)` },
    { id: "requirements", label: "Requirements" },
    { id: "keywords", label: "Keywords" },
    { id: "ad", label: "Job ad" },
  ];

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-4">
        {languageMismatch && (
          <Notice>
            <span className="inline-flex items-center gap-1.5 font-semibold">
              <Languages className="size-4" /> The ad is in {analysis.jobLanguage === "de" ? "German" : "English"}, your profile in{" "}
              {job.language === "de" ? "German" : "English"}.
            </span>{" "}
            Suggestions stay in your profile's language, and keywords are matched by meaning, including the ad's original terms. Some ATS match words literally, so for
            employers that expect {analysis.jobLanguage === "de" ? "German" : "English"} CVs, a profile in that language may score better.
          </Notice>
        )}

        <div className="flex gap-1 overflow-x-auto rounded-lg bg-subtle p-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cx(
                "rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition",
                tab === t.id ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "suggestions" && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted">
                {accepted.length} accepted · {pending.length} open · {job.suggestions.length - accepted.length - pending.length} rejected
              </span>
              <span className="ml-auto flex gap-2">
                {safePending.length > 0 && (
                  <Button
                    size="sm"
                    onClick={() => actions.bulk.mutate({ ids: safePending.map((s) => s.id), status: "accepted" })}
                    title="Accepts open suggestions that don't add anything missing from your profile"
                  >
                    <CheckCheck /> Accept all safe ({safePending.length})
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => confirm("Run the analysis again? Current suggestions will be replaced.") && actions.reanalyze.mutate({ refreshProfile: true })}>
                  <RefreshCw /> Re-run with latest profile
                </Button>
              </span>
            </div>
            {job.suggestions.length === 0 && <Notice>No suggestions: ChatGPT found nothing worth changing. Try re-running with preferences.</Notice>}
            {actions.regenerate.error && <Notice tone="error">{(actions.regenerate.error as Error).message}</Notice>}
            {job.suggestions.map((s) => (
              <SuggestionCard
                key={s.id}
                suggestion={s}
                base={base}
                analysis={analysis}
                warnings={warnings[s.id] ?? []}
                delta={s.status === "pending" ? (deltas[s.id] ?? null) : null}
                regenerating={regeneratingId === s.id}
                onPatch={(patch) => actions.patchSuggestion.mutate({ sid: s.id, patch })}
                onRegenerate={(instruction) => regenerate(s, instruction)}
              />
            ))}
          </>
        )}

        {tab === "requirements" && <RequirementsTab job={job} analysis={analysis} />}
        {tab === "keywords" && <KeywordsTab matched={currentScore.keywords.matched.map((k) => k.term)} missing={currentScore.keywords.missing.map((k) => k.term)} analysis={analysis} />}
        {tab === "ad" && (
          <Card className="p-5">
            <pre className="font-sans text-sm leading-relaxed whitespace-pre-wrap">{job.description}</pre>
          </Card>
        )}
      </div>

      <div className="flex flex-col gap-4 xl:sticky xl:top-8 xl:max-h-[calc(100dvh-4rem)] xl:overflow-y-auto xl:pb-4">
        <ScorePanel base={baseScore} current={currentScore} fitStale={fitStale} assessing={actions.assess.isPending} onAssess={() => actions.assess.mutate()} />
        <ExportPanel
          kind="job"
          id={job.id}
          version={acceptedKey(job.suggestions)}
          blockedReason={accepted.length === 0 ? "No suggestions accepted yet: the export would be identical to your master profile." : null}
        />
        <div className="rounded-xl bg-subtle p-4">
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
            <span className="font-semibold text-sm">Tailored CV</span>
            <label className="flex items-center gap-1.5 text-muted">
              <input type="checkbox" className="accent-accent" checked={highlight} onChange={(e) => setHighlight(e.target.checked)} />
              Highlight changes
            </label>
            <label className="flex items-center gap-1.5 text-muted">
              <input type="checkbox" className="accent-accent" checked={includePending} onChange={(e) => setIncludePending(e.target.checked)} />
              Include open suggestions
            </label>
          </div>
          <CvPreview data={preview.data} language={job.language} changes={highlight ? preview.changes : null} />
        </div>
      </div>
    </div>
  );
}

const STATUS_STYLE: Record<RequirementStatus, { label: string; className: string; icon: typeof Check }> = {
  met: { label: "Met", className: "bg-success/12 text-success", icon: Check },
  partial: { label: "Partial", className: "bg-warn-bg text-warn-fg", icon: Check },
  missing: { label: "Missing", className: "bg-danger/10 text-danger", icon: X },
};

function RequirementsTab({ job, analysis }: { job: Job; analysis: JobAnalysis }) {
  return (
    <div className="flex flex-col gap-3">
      {job.assessment && (
        <Card className="p-4 text-sm">
          <div className="mb-1 font-semibold">Overall</div>
          <p className="text-muted">{job.assessment.overall}</p>
        </Card>
      )}
      <Card className="divide-y divide-border">
        {analysis.requirements.map((r) => {
          const a = job.assessment?.requirements.find((x) => x.id === r.id);
          const st = STATUS_STYLE[a?.status ?? "missing"];
          return (
            <div key={r.id} className="flex gap-3 p-4">
              <span className={cx("h-fit shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold", st.className)}>{st.label}</span>
              <div className="min-w-0">
                <div className="text-sm font-medium">
                  {r.text} {!r.mustHave && <span className="text-xs font-normal text-muted">· nice to have</span>}
                </div>
                {a?.evidence && <p className="mt-0.5 text-xs text-muted">{a.evidence}</p>}
              </div>
            </div>
          );
        })}
      </Card>
    </div>
  );
}

function KeywordsTab({ matched, missing, analysis }: { matched: string[]; missing: string[]; analysis: JobAnalysis }) {
  const byTerm = new Map(analysis.keywords.map((k) => [k.term, k]));
  const chip = (term: string, ok: boolean) => {
    const k = byTerm.get(term);
    return (
      <span
        key={term}
        title={k?.variants.length ? `Also matches: ${k.variants.join(", ")}` : undefined}
        className={cx("inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium", ok ? "bg-success/12 text-success" : "bg-subtle text-muted")}
      >
        {ok ? <Check className="size-3" /> : <X className="size-3" />}
        {term}
        {k?.importance === "high" && <span className="opacity-60">★</span>}
      </span>
    );
  };
  return (
    <Card className="flex flex-col gap-4 p-5">
      <p className="text-xs text-muted">
        Keywords an ATS scans for, matched against your tailored CV (with accepted suggestions). ★ = high importance. Missing keywords only belong in your CV if
        they're true. Hover to see accepted variants.
      </p>
      <div>
        <div className="mb-2 text-sm font-semibold">Found ({matched.length})</div>
        <div className="flex flex-wrap gap-1.5">{matched.map((t) => chip(t, true))}</div>
      </div>
      <div>
        <div className="mb-2 text-sm font-semibold">Missing ({missing.length})</div>
        <div className="flex flex-wrap gap-1.5">{missing.map((t) => chip(t, false))}</div>
      </div>
    </Card>
  );
}
