import { useEffect, useState } from "react";
import { FileDown, PenLine, Wand2 } from "lucide-react";
import { APP_STATUSES, type AppStatus, type Job } from "@rb/shared";
import { downloadFile, exportUrl, letterUrl, useJobActions } from "../lib/api";
import { Button, Card, Input, Notice, Select, Spinner, Textarea, cx } from "./ui";

export const STATUS_LABEL: Record<AppStatus, string> = {
  draft: "Draft",
  applied: "Applied",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
};

export const STATUS_STYLE: Record<AppStatus, string> = {
  draft: "bg-subtle text-muted",
  applied: "bg-accent-soft text-accent-soft-fg",
  interview: "bg-warn-bg text-warn-fg",
  offer: "bg-success/15 text-success",
  rejected: "bg-danger/10 text-danger",
};

export function StatusBadge({ status }: { status: AppStatus }) {
  return <span className={cx("rounded-md px-2 py-0.5 text-xs font-semibold", STATUS_STYLE[status])}>{STATUS_LABEL[status]}</span>;
}

async function tryDownload(url: string) {
  try {
    await downloadFile(url);
  } catch (err) {
    alert((err as Error).message);
  }
}

/** Status, notes, history and the frozen "as sent" files. */
export function TrackingCard({ job }: { job: Job }) {
  const { tracking } = useJobActions(job.id);
  const [notes, setNotes] = useState(job.notes);
  useEffect(() => setNotes(job.notes), [job.notes]);

  const setStatus = (appStatus: AppStatus) => {
    if (appStatus === "applied" && job.sent && !confirm("Mark as applied again? This replaces the saved 'as sent' version with the current CV and cover letter.")) return;
    tracking.mutate({ appStatus });
  };

  return (
    <Card className="p-5">
      <div className="flex items-center gap-3">
        <div className="mr-auto font-semibold">Application</div>
        <Select className={cx("h-8 w-auto py-0 text-sm font-semibold", STATUS_STYLE[job.appStatus])} value={job.appStatus} onChange={(e) => setStatus(e.target.value as AppStatus)}>
          {APP_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
      </div>
      {job.appStatus === "draft" && !job.sent && (
        <p className="mt-2 text-xs text-muted">When you set it to Applied, the current CV and cover letter are saved as "sent", so you always know what the employer has.</p>
      )}
      {job.history.length > 0 && (
        <ol className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
          {job.history.map((h, i) => (
            <li key={i}>
              <span className="font-medium text-fg">{STATUS_LABEL[h.status]}</span> {new Date(h.at).toLocaleDateString()}
            </li>
          ))}
        </ol>
      )}
      {job.sent && (
        <div className="mt-3 rounded-lg bg-subtle p-3 text-sm">
          <div className="text-xs font-medium text-muted">Sent on {new Date(job.sent.at).toLocaleDateString()}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => tryDownload(exportUrl("sent", job.id, "pdf"))}>
              <FileDown /> CV PDF
            </Button>
            <Button size="sm" onClick={() => tryDownload(exportUrl("sent", job.id, "docx"))}>
              <FileDown /> CV Word
            </Button>
            {job.sent.coverLetter && (
              <>
                <Button size="sm" onClick={() => tryDownload(letterUrl(job.id, "pdf", true))}>
                  <FileDown /> Letter PDF
                </Button>
                <Button size="sm" onClick={() => tryDownload(letterUrl(job.id, "docx", true))}>
                  <FileDown /> Letter Word
                </Button>
              </>
            )}
          </div>
        </div>
      )}
      <Textarea
        className="mt-3 text-sm"
        placeholder="Notes: contact person, salary range, interview dates…"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => notes !== job.notes && tracking.mutate({ notes })}
      />
    </Card>
  );
}

export function CoverLetterTab({ job }: { job: Job }) {
  const { writeLetter, saveLetter } = useJobActions(job.id);
  const [text, setText] = useState(job.coverLetter?.text ?? "");
  const [instructions, setInstructions] = useState("");
  useEffect(() => setText(job.coverLetter?.text ?? ""), [job.coverLetter?.text]);
  const dirty = text !== (job.coverLetter?.text ?? "");
  const accepted = job.suggestions.some((s) => s.status === "accepted");

  const generate = () => {
    if (job.coverLetter && !confirm("Replace the current cover letter with a new one?")) return;
    writeLetter.mutate(instructions);
  };

  return (
    <div className="flex flex-col gap-3">
      <Card className="p-4">
        <p className="text-xs text-muted">
          Written in your profile's language from your {accepted ? "tailored CV (accepted suggestions)" : "CV"} and this job ad, using only facts from your CV.
        </p>
        <div className="mt-3 flex gap-2">
          <Input placeholder='Optional: "mention I can start in March", "more formal", "shorter"' value={instructions} onChange={(e) => setInstructions(e.target.value)} />
          <Button variant="primary" onClick={generate} disabled={writeLetter.isPending}>
            {writeLetter.isPending ? <Spinner className="size-3.5" /> : job.coverLetter ? <Wand2 /> : <PenLine />}
            {writeLetter.isPending ? "Writing…" : job.coverLetter ? "Rewrite" : "Write cover letter"}
          </Button>
        </div>
        {writeLetter.error && (
          <div className="mt-3">
            <Notice tone="error">{(writeLetter.error as Error).message}</Notice>
          </div>
        )}
      </Card>

      {job.coverLetter && (
        <Card className="p-4">
          <Textarea className="min-h-96 text-sm leading-relaxed" value={text} onChange={(e) => setText(e.target.value)} />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="primary" disabled={!dirty || saveLetter.isPending} onClick={() => saveLetter.mutate(text)}>
              {dirty ? "Save changes" : "Saved"}
            </Button>
            <span className="text-xs text-muted">{text.trim().split(/\s+/).filter(Boolean).length} words</span>
            <span className="ml-auto flex gap-2">
              <Button size="sm" disabled={dirty} title={dirty ? "Save first" : undefined} onClick={() => tryDownload(letterUrl(job.id, "pdf"))}>
                <FileDown /> PDF
              </Button>
              <Button size="sm" disabled={dirty} title={dirty ? "Save first" : undefined} onClick={() => tryDownload(letterUrl(job.id, "docx"))}>
                <FileDown /> Word
              </Button>
            </span>
          </div>
        </Card>
      )}
    </div>
  );
}
