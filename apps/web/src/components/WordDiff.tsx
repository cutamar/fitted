import { diffWordsWithSpace } from "diff";
import { useMemo } from "react";

/** Share of words that changed; above ~0.5 an inline diff is harder to read than before/after. */
function changedShare(parts: ReturnType<typeof diffWordsWithSpace>): number {
  let changed = 0;
  let total = 0;
  for (const p of parts) {
    const words = p.value.split(/\s+/).filter(Boolean).length;
    total += words;
    if (p.added || p.removed) changed += words;
  }
  return total ? changed / total : 0;
}

/**
 * Word-level diff. Small edits render inline; near-complete rewrites render as
 * struck "before" above the new text (on the CV sheet: the new text highlighted).
 * `paper` uses fixed colors for the white CV sheet; otherwise theme tokens.
 */
export function WordDiff({ before, after, paper = false }: { before: string; after: string; paper?: boolean }) {
  const parts = useMemo(() => diffWordsWithSpace(before, after), [before, after]);
  const add = paper ? "bg-[#d9f5e6] text-[#0b5a3c]" : "rounded-sm bg-success/15 text-success";
  const del = paper ? "bg-[#fde3df] text-[#9c2a14] line-through" : "rounded-sm bg-danger/12 text-danger line-through decoration-danger/60";

  if (before && changedShare(parts) > 0.55) {
    if (paper) return <span className="bg-[#d9f5e6]" title={`Before: ${before}`}>{after}</span>;
    return (
      <span className="flex flex-col gap-2">
        <del className="text-muted decoration-danger/50">{before}</del>
        <ins className="text-fg no-underline">
          <span className="rounded-sm bg-success/15">{after}</span>
        </ins>
      </span>
    );
  }

  return (
    <>
      {parts.map((p, i) =>
        p.added ? (
          <ins key={i} className={`${add} no-underline`}>
            {p.value}
          </ins>
        ) : p.removed ? (
          <del key={i} className={del}>
            {p.value}
          </del>
        ) : (
          <span key={i}>{p.value}</span>
        ),
      )}
    </>
  );
}

/** Tag list diff: kept, added (green), removed (struck). Order follows the new list. */
export function TagsDiff({ before, after, paper = false }: { before: string[]; after: string[]; paper?: boolean }) {
  const old = new Set(before.map((t) => t.toLowerCase()));
  const next = new Set(after.map((t) => t.toLowerCase()));
  const removed = before.filter((t) => !next.has(t.toLowerCase()));
  const add = paper ? "bg-[#d9f5e6] text-[#0b5a3c]" : "bg-success/15 text-success";
  const del = paper ? "bg-[#fde3df] text-[#9c2a14] line-through" : "bg-danger/12 text-danger line-through";
  const items = [...after.map((t) => ({ t, kind: old.has(t.toLowerCase()) ? "kept" : "added" })), ...removed.map((t) => ({ t, kind: "removed" }))];
  return (
    <>
      {items.map(({ t, kind }, i) => (
        <span key={`${t}-${i}`}>
          {i > 0 && ", "}
          <span className={kind === "added" ? add : kind === "removed" ? del : undefined}>{t}</span>
        </span>
      ))}
    </>
  );
}
