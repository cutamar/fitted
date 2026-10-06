import { useEffect, useState } from "react";
import { Briefcase, Plus, Sparkles } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { computeScore, tailoredData, type Job } from "@rb/shared";
import { StatusBadge } from "../components/Application";
import { ScoreRing } from "../components/ScorePanel";
import { Badge, Button, Card, Field, Notice, PageHeader, Select, Spinner, Textarea, cx } from "../components/ui";
import { loginUrl, useAuthStatus, useCreateJob, useJobs, useProfiles } from "../lib/api";

export function JobsPage() {
  const { data: jobs, isLoading } = useJobs();
  const [creating, setCreating] = useState(false);
  const showForm = creating || jobs?.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Job applications"
        description="Paste a job ad, pick a master profile, and get a match score with suggested edits you can review one by one."
        actions={
          !showForm && (
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus /> New application
            </Button>
          )
        }
      />
      {showForm && <NewJobForm onCancel={jobs?.length ? () => setCreating(false) : undefined} />}
      {isLoading && <Spinner className="text-muted" />}
      <div className="flex flex-col gap-3">
        {jobs?.map((j) => (
          <JobRow key={j.id} job={j} />
        ))}
      </div>
    </div>
  );
}

function JobRow({ job }: { job: Job }) {
  // The tailored CV's score (accepted suggestions applied), same as on the job page.
  const score = job.analysis && job.base ? computeScore(tailoredData(job.base, job.suggestions), job.analysis, job.assessment).overall : null;
  const accepted = job.suggestions.filter((s) => s.status === "accepted").length;
  return (
    <Link to={`/jobs/${job.id}`}>
      <Card className="flex items-center gap-4 p-4 transition hover:border-accent/40 hover:shadow-md">
        {score !== null ? (
          <ScoreRing value={score} size={52} />
        ) : (
          <div className="flex size-[52px] shrink-0 items-center justify-center rounded-full bg-subtle text-muted">
            {job.status === "analyzing" ? <Spinner /> : <Briefcase className="size-5" />}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{job.analysis?.title || firstLine(job.description)}</div>
          <div className="truncate text-sm text-muted">
            {job.analysis?.company || "Company unknown"} · Profile: {job.profileName}
          </div>
        </div>
        <StatusBadge status={job.appStatus} />
        <div className="hidden text-right text-xs text-muted sm:block">
          {job.status === "analyzing" && <span className="text-accent">{job.step}…</span>}
          {job.status === "error" && <span className="text-danger">Analysis failed</span>}
          {job.status === "ready" && (
            <>
              {accepted} of {job.suggestions.length} suggestions accepted
            </>
          )}
          <div className="mt-0.5">{new Date(job.createdAt).toLocaleDateString()}</div>
        </div>
      </Card>
    </Link>
  );
}

const firstLine = (t: string) => t.trim().split("\n")[0]!.slice(0, 80);

function NewJobForm({ onCancel }: { onCancel?: () => void }) {
  const { data: profiles } = useProfiles();
  const auth = useAuthStatus();
  const create = useCreateJob();
  const navigate = useNavigate();
  const [description, setDescription] = useState("");
  const [profileId, setProfileId] = useState("");
  const [instructions, setInstructions] = useState("");
  const [showInstructions, setShowInstructions] = useState(false);

  useEffect(() => {
    if (!profileId && profiles?.[0]) setProfileId(profiles[0].id);
  }, [profiles, profileId]);

  const aiReady = auth.data?.connected === true && auth.data.sharing;
  const profile = profiles?.find((p) => p.id === profileId);

  if (profiles?.length === 0) {
    return (
      <Notice>
        You need a master profile first. <Link to="/import" className="font-medium underline">Import your CV</Link> to create one.
      </Notice>
    );
  }

  return (
    <Card className="p-5">
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const job = await create.mutateAsync({ profileId, description, instructions });
          navigate(`/jobs/${job.id}`);
        }}
      >
        <Field label="Job description">
          <Textarea
            autoFocus
            className="min-h-48"
            placeholder="Paste the full job ad here: title, responsibilities, requirements…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <div className="flex flex-wrap items-end gap-3">
          {profiles && profiles.length > 1 ? (
            <Field label="Tailor from profile" className="min-w-56">
              <Select value={profileId} onChange={(e) => setProfileId(e.target.value)}>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.language.toUpperCase()})
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            profile && (
              <div className="text-sm text-muted">
                Tailoring from <span className="font-medium text-fg">{profile.name}</span> <Badge>{profile.language}</Badge>
              </div>
            )
          )}
          <button type="button" className={cx("text-sm font-medium text-accent", showInstructions && "hidden")} onClick={() => setShowInstructions(true)}>
            + Add preferences for suggestions
          </button>
        </div>
        {showInstructions && (
          <Field label="Preferences (optional)">
            <Textarea
              placeholder={'e.g. "Emphasize leadership", "Keep it to one page", "No buzzwords", "Don\'t touch the education section"'}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
            />
          </Field>
        )}
        {profile && (
          <p className="text-xs text-muted">
            Suggestions are written in {profile.language === "de" ? "German" : "English"} (the profile's language), whatever language the ad is in.
          </p>
        )}
        {auth.data && !aiReady && (
          <Notice>
            Analysis needs ChatGPT. <a href={loginUrl()} className="font-medium underline">Sign in with ChatGPT</a> first.
          </Notice>
        )}
        {create.error && <Notice tone="error">{(create.error as Error).message}</Notice>}
        <div className="flex gap-2">
          <Button type="submit" variant="primary" disabled={!aiReady || !profileId || description.trim().length < 80 || create.isPending}>
            <Sparkles /> Analyze match
          </Button>
          {onCancel && (
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}
