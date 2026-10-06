import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Rocket, X, Zap } from "lucide-react";
import { computeScore, tailoredData, unsupportedClaims, type Job } from "@rb/shared";
import { useBoost, useJobActions } from "../lib/api";
import { ScoreRing } from "./ScorePanel";
import { Button, Input, Notice, Spinner, cx } from "./ui";

type Answer = { answer: "yes" | "no"; details: string };
const AUTO_APPLY_MS = 2500;
/** Rough line for "ready to apply"; the score is a guide, not a pass mark. */
export const GOOD_SCORE = 75;

const scoreOf = (job: Job) => (job.analysis && job.base ? computeScore(tailoredData(job.base, job.suggestions), job.analysis, job.assessment).overall : 0);

/**
 * Quick boost: answer yes/no questions about the biggest gaps; once all are
 * answered the CV updates on its own (yes answers become accepted changes).
 */
export function QuickBoost({ job, onClose }: { job: Job; onClose: () => void }) {
  const { ask, apply } = useBoost(job.id);
  const { assess } = useJobActions(job.id);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [acceptSafe, setAcceptSafe] = useState(true);
  const [paused, setPaused] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [result, setResult] = useState<{ before: number; added: number; acceptedSafe: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const open = job.boost.filter((q) => !q.answer);
  const answeredAll = open.length > 0 && open.every((q) => answers[q.id]);
  const safeCount = useMemo(() => {
    if (!job.base || !job.analysis) return 0;
    const ctx = tailoredData(job.base, job.suggestions);
    return job.suggestions.filter((s) => s.status === "pending" && !unsupportedClaims(s, job.base!, job.analysis!, ctx).length).length;
  }, [job]);

  // Start with fresh questions when there are none open.
  useEffect(() => {
    if (!open.length && !ask.isPending && !ask.error && !result) ask.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = () => {
    if (timer.current) clearTimeout(timer.current);
    setCountdown(null);
    const before = scoreOf(job);
    apply.mutate(
      { answers: open.map((q) => ({ id: q.id, ...answers[q.id]! })), acceptSafe },
      {
        onSuccess: (r) => {
          setResult({ before, added: r.added, acceptedSafe: r.acceptedSafe });
          setAnswers({});
          // Requirement fit comes from ChatGPT: refresh it so the score reflects the new CV.
          if (r.added + r.acceptedSafe > 0) assess.mutate();
        },
      },
    );
  };

  // Auto-apply once everything is answered and the user stopped typing.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!answeredAll || paused || apply.isPending || apply.isError) {
      setCountdown(null);
      return;
    }
    setCountdown(Math.ceil(AUTO_APPLY_MS / 1000));
    timer.current = setTimeout(run, AUTO_APPLY_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, answeredAll, paused, acceptSafe]);

  const set = (id: string, patch: Partial<Answer>) => {
    if (apply.isError) apply.reset();
    setAnswersInner(id, patch);
  };
  const setAnswersInner = (id: string, patch: Partial<Answer>) =>
    setAnswers((a) => ({ ...a, [id]: { answer: a[id]?.answer ?? "yes", details: a[id]?.details ?? "", ...patch } }));

  const now = scoreOf(job);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-[8vh] backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-surface shadow-2xl">
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <span className="flex size-9 items-center justify-center rounded-xl bg-accent-soft text-accent-soft-fg">
            <Zap className="size-4" />
          </span>
          <div className="mr-auto">
            <div className="font-semibold">Quick boost</div>
            <div className="text-xs text-muted">Answer yes or no. Your CV updates automatically when you're done.</div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} title="Close">
            <X />
          </Button>
        </div>

        <div className="flex flex-col gap-3 p-5">
          {result && !apply.isPending && (
            <div className="flex items-center gap-4 rounded-xl bg-subtle p-4">
              <ScoreRing value={now} size={64} />
              <div className="text-sm">
                <div className="font-semibold">
                  {result.before} → {now}
                  {assess.isPending && <span className="ml-2 text-xs font-normal text-muted">re-checking requirement fit…</span>}
                </div>
                <div className="text-muted">
                  {result.added} change{result.added === 1 ? "" : "s"} from your answers
                  {result.acceptedSafe > 0 && `, ${result.acceptedSafe} open suggestion${result.acceptedSafe === 1 ? "" : "s"} accepted`}. All are in your list and can be undone.
                </div>
                {now >= GOOD_SCORE && <div className="mt-1 font-medium text-success">Strong match. Review the changes, export, and apply.</div>}
              </div>
            </div>
          )}

          {ask.isPending && (
            <div className="flex items-center gap-3 py-6 text-sm text-muted">
              <Spinner className="text-accent" /> Finding the gaps that cost you the most points…
            </div>
          )}
          {ask.error && <Notice tone={(ask.error as Error).message.startsWith("Nothing left") ? "warn" : "error"}>{(ask.error as Error).message}</Notice>}

          {!ask.isPending && open.length > 0 && (
            <>
              <ol className="flex flex-col gap-2">
                {open.map((q, i) => {
                  const a = answers[q.id];
                  return (
                    <li key={q.id} className={cx("rounded-xl border p-3 transition", a ? "border-border bg-subtle/50" : "border-border")}>
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 w-5 shrink-0 text-right text-xs font-semibold text-muted tabular-nums">{i + 1}</span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium">{q.question}</div>
                          <div className="mt-0.5 text-[11px] text-muted">
                            Covers {q.kind}: {q.label}
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Button size="sm" variant={a?.answer === "yes" ? "primary" : "secondary"} onClick={() => set(q.id, { answer: "yes" })}>
                            <Check /> Yes
                          </Button>
                          <Button size="sm" variant={a?.answer === "no" ? "soft" : "secondary"} onClick={() => set(q.id, { answer: "no" })}>
                            No
                          </Button>
                        </div>
                      </div>
                      {a?.answer === "yes" && (
                        <div className="mt-2 pl-8">
                          <Input
                            className="h-8 text-xs"
                            placeholder="Optional detail: where, how, a number (e.g. “at Acme, weekly A/B tests”)"
                            value={a.details}
                            onChange={(e) => set(q.id, { details: e.target.value })}
                          />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>

              {safeCount > 0 && (
                <label className="flex items-center gap-2 text-xs text-muted">
                  <input type="checkbox" className="accent-accent" checked={acceptSafe} onChange={(e) => setAcceptSafe(e.target.checked)} />
                  Also accept the {safeCount} open suggestion{safeCount === 1 ? "" : "s"} that add nothing new
                </label>
              )}

              {apply.error && (
                <Notice tone="error">
                  {(apply.error as Error).message} Your answers are kept: click “Update my CV” to try again.
                </Notice>
              )}
              <div className="flex items-center gap-2 border-t border-border pt-3">
                <span className="mr-auto text-xs text-muted">
                  {apply.isPending
                    ? "Updating your CV… with many yes answers this takes 1–2 minutes."
                    : countdown !== null
                      ? `All answered. Updating your CV in a moment…`
                      : `${Object.keys(answers).filter((id) => open.some((q) => q.id === id)).length} of ${open.length} answered`}
                </span>
                {countdown !== null && !apply.isPending && (
                  <Button size="sm" variant="ghost" onClick={() => setPaused(true)}>
                    Wait
                  </Button>
                )}
                <Button variant="primary" disabled={!answeredAll || apply.isPending} onClick={run}>
                  {apply.isPending ? <Spinner className="size-3.5" /> : <Rocket />} Update my CV
                </Button>
              </div>
            </>
          )}

          {!ask.isPending && !open.length && result && (
            <div className="flex justify-end gap-2">
              <Button onClick={() => ask.mutate()}>Ask more questions</Button>
              <Button variant="primary" onClick={onClose}>
                Done
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
