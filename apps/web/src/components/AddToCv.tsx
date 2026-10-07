import { useState } from "react";
import { Sparkles } from "lucide-react";
import type { Job, ProfileData } from "@rb/shared";
import { useAddToCv, type AddToCvInput } from "../lib/api";
import { Button, Notice, Select, Spinner, Textarea } from "./ui";

export type AddTarget = { requirementId: string; label: string } | { keywords: string[]; label: string };

function entryOptions(base: ProfileData) {
  return base.sections.flatMap((s) =>
    s.items.filter((i) => !i.hidden).map((i) => ({ id: i.id, label: `${s.title} › ${[i.title, i.subtitle].filter(Boolean).join(" @ ") || "entry"}` })),
  );
}

/**
 * Inline form: "what's true about this?" + where it should go. The result is a
 * normal suggestion card, so it's reviewed and previewed like any other change.
 */
export function AddToCvForm({ job, target, onAdded, onCancel }: { job: Job; target: AddTarget; onAdded: (suggestionId: string) => void; onCancel: () => void }) {
  const add = useAddToCv(job.id);
  const [details, setDetails] = useState("");
  const [itemId, setItemId] = useState("");

  const submit = () => {
    const input: AddToCvInput = { details, itemId: itemId || undefined, ...("requirementId" in target ? { requirementId: target.requirementId } : { keywords: target.keywords }) };
    add.mutate(input, { onSuccess: ({ suggestionId }) => onAdded(suggestionId) });
  };

  return (
    <div className="mt-2 flex flex-col gap-2 rounded-lg border border-accent/30 bg-accent-soft/40 p-3">
      <div className="text-sm font-medium">
        {"keywords" in target && target.keywords.length > 1 ? `Add ${target.keywords.length} keywords to your CV: ${target.label}` : `Add “${target.label}” to your CV`}
      </div>
      <Textarea
        autoFocus
        className="text-sm"
        placeholder={
          "keywords" in target
            ? "Optional: what's true about these? e.g. “Used Amplitude and Mixpanel daily for funnel analysis at Northwind Labs.”"
            : "What's true about this? e.g. “Set up Prometheus and Grafana dashboards for our Kubernetes clusters at Northwind Labs.” Leave empty to only use what your CV already says."
        }
        value={details}
        onChange={(e) => setDetails(e.target.value)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Select className="h-8 w-auto max-w-full py-0 text-xs" value={itemId} onChange={(e) => setItemId(e.target.value)} aria-label="Where in the CV">
          <option value="">Where: let ChatGPT pick the best place</option>
          {entryOptions(job.base!).map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </Select>
        <span className="ml-auto flex gap-2">
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" variant="primary" onClick={submit} disabled={add.isPending}>
            {add.isPending ? <Spinner className="size-3" /> : <Sparkles />} {add.isPending ? "Placing it…" : "Create suggestion"}
          </Button>
        </span>
      </div>
      {"keywords" in target && !details.trim() && (
        <p className="text-[11px] text-muted">Tip: to put them in your skills list, pick it under “Where”. ChatGPT places them in a sensible order.</p>
      )}
      {add.error && <Notice tone="error">{(add.error as Error).message}</Notice>}
    </div>
  );
}
