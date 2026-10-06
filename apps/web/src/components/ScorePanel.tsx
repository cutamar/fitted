import { useState, type ReactNode } from "react";
import { Check, ChevronDown, ChevronRight, RefreshCw, X, Zap } from "lucide-react";
import type { Score } from "@rb/shared";
import { Button, Card, Spinner, cx } from "./ui";

function tone(score: number) {
  return score >= 75 ? "text-success" : score >= 50 ? "text-[#c98a00]" : "text-danger";
}

export function ScoreRing({ value, size = 88 }: { value: number; size?: number }) {
  const r = size / 2 - 7;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="7" className="stroke-subtle" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - value / 100)}
          className={cx("stroke-current transition-[stroke-dashoffset] duration-500", tone(value))}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold tabular-nums">{value}</span>
      </div>
    </div>
  );
}

function Bar({ label, value, hint, action }: { label: string; value: number | null; hint: string; action?: ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="font-medium">{label}</span>
        <span className="flex items-center gap-2">
          {action}
          <span className={cx("font-semibold tabular-nums", value !== null && tone(value))}>{value ?? "–"}</span>
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-subtle">
        <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${value ?? 0}%` }} />
      </div>
      <p className="mt-1 text-xs text-muted">{hint}</p>
    </div>
  );
}

interface Props {
  base: Score;
  current: Score;
  fitStale: boolean;
  assessing: boolean;
  onAssess: () => void;
  onBoost: () => void;
}

export function ScorePanel({ base, current, fitStale, assessing, onAssess, onBoost }: Props) {
  const [showChecks, setShowChecks] = useState(false);
  const delta = current.overall - base.overall;

  return (
    <Card className="p-5">
      <div className="flex items-center gap-4">
        <ScoreRing value={current.overall} />
        <div>
          <div className="text-sm font-semibold">Match score</div>
          <div className="mt-0.5 text-xs text-muted">
            Master profile: {base.overall}
            {delta !== 0 && (
              <span className={cx("ml-1.5 font-semibold", delta > 0 ? "text-success" : "text-danger")}>
                {delta > 0 ? "+" : ""}
                {delta} with your changes
              </span>
            )}
          </div>
          <div className="mt-1 text-[11px] text-muted">40% keywords · 40% requirement fit · 20% ATS format</div>
        </div>
        <Button variant="primary" size="sm" className="ml-auto self-start" onClick={onBoost} title="Answer a few yes/no questions to raise your score">
          <Zap /> Quick boost
        </Button>
      </div>

      <div className="mt-5 flex flex-col gap-4">
        <Bar
          label="Keywords"
          value={current.keywords.score}
          hint={`${current.keywords.matched.length} of ${current.keywords.matched.length + current.keywords.missing.length} job keywords found (weighted by importance)`}
        />
        <Bar
          label="Requirement fit"
          value={current.fit?.score ?? null}
          hint={
            current.fit
              ? `${current.fit.met} met · ${current.fit.partial} partial · ${current.fit.missing} missing${fitStale ? " · from before your changes" : ""}`
              : "Not assessed yet"
          }
          action={
            fitStale && (
              <Button size="sm" variant="soft" onClick={onAssess} disabled={assessing} title="Ask ChatGPT to re-check requirements against your tailored CV">
                {assessing ? <Spinner className="size-3" /> : <RefreshCw />} Re-check
              </Button>
            )
          }
        />
        <div>
          <Bar label="ATS format" value={current.ats.score} hint={`${current.ats.checks.filter((c) => c.pass).length} of ${current.ats.checks.length} checks passed`} />
          <button type="button" className="mt-1 flex items-center gap-1 text-xs font-medium text-accent" onClick={() => setShowChecks((s) => !s)}>
            {showChecks ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />} Details
          </button>
          {showChecks && (
            <ul className="mt-2 flex flex-col gap-1.5">
              {current.ats.checks.map((c) => (
                <li key={c.id} className="flex gap-2 text-xs">
                  {c.pass ? <Check className="size-3.5 shrink-0 text-success" /> : <X className="size-3.5 shrink-0 text-danger" />}
                  <span>
                    <span className="font-medium">{c.label}</span>
                    <span className="text-muted"> · {c.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}
