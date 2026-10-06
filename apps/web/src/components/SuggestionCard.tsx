import { useState } from "react";
import { AlertTriangle, LocateFixed, ArrowDownUp, Check, EyeOff, Eye, FileText, Heading, List, Pencil, Plus, Tags, Trash2, Undo2, Wand2, X } from "lucide-react";
import {
  suggestionTags,
  suggestionText,
  type Block,
  type ClaimWarning,
  type Item,
  type JobAnalysis,
  type ProfileData,
  type Suggestion,
  type SuggestionType,
} from "@rb/shared";
import { TagsDiff, WordDiff } from "./WordDiff";
import { Button, Input, Spinner, Textarea, cx } from "./ui";
import type { SuggestionPatch } from "../lib/api";

const TYPE_META: Record<SuggestionType, { label: string; icon: typeof Plus }> = {
  rewrite_summary: { label: "Summary", icon: FileText },
  rewrite_headline: { label: "Headline", icon: Heading },
  rewrite_block: { label: "Rewrite", icon: Pencil },
  insert_block: { label: "Add", icon: Plus },
  remove_block: { label: "Remove", icon: Trash2 },
  set_tags: { label: "Skills", icon: Tags },
  hide_item: { label: "Hide entry", icon: EyeOff },
  show_item: { label: "Show entry", icon: Eye },
  move_item: { label: "Reorder", icon: ArrowDownUp },
};

function locate(base: ProfileData, s: Suggestion): { item: Item | null; block: Block | null; sectionTitle: string } {
  // Block first: block suggestions may also carry their entry's itemId.
  for (const section of base.sections) {
    for (const item of section.items) {
      const block = s.blockId ? item.content.find((b) => b.id === s.blockId) : undefined;
      if (block) return { item, block, sectionTitle: section.title };
    }
  }
  for (const section of base.sections) {
    const item = section.items.find((i) => i.id === s.itemId);
    if (item) return { item, block: null, sectionTitle: section.title };
  }
  return { item: null, block: null, sectionTitle: "" };
}

const WARNING_LABEL: Record<ClaimWarning["kind"], string> = {
  keyword: "keyword not in your profile",
  number: "number not in your profile",
  tag: "not listed for this entry",
  model: "flagged by ChatGPT",
};

interface Props {
  suggestion: Suggestion;
  base: ProfileData;
  analysis: JobAnalysis;
  warnings: ClaimWarning[];
  delta: number | null;
  regenerating: boolean;
  onPatch: (patch: SuggestionPatch) => void;
  onRegenerate: (instruction: string) => void;
  /** "Show in CV" target: outlined here and in the preview. */
  focused: boolean;
  onFocus: () => void;
}

export function SuggestionCard({ suggestion: s, base, analysis, warnings, delta, regenerating, onPatch, onRegenerate, focused, onFocus }: Props) {
  const [mode, setMode] = useState<"view" | "edit" | "regenerate">("view");
  const [draft, setDraft] = useState("");
  const [instruction, setInstruction] = useState("");
  const { item, block, sectionTitle } = locate(base, s);
  const meta = TYPE_META[s.type];
  const Icon = meta.icon;
  const editable = s.type !== "remove_block" && s.type !== "hide_item" && s.type !== "show_item" && s.type !== "move_item";
  const isTags = s.type === "set_tags";
  const edited = s.editedText !== null || s.editedTags !== null;
  const requirements = analysis.requirements.filter((r) => s.requirementIds.includes(r.id));

  const startEdit = () => {
    setDraft(isTags ? suggestionTags(s).join(", ") : suggestionText(s));
    setMode("edit");
  };
  const saveEdit = () => {
    if (isTags) onPatch({ editedTags: draft.split(",").map((t) => t.trim()).filter(Boolean) });
    else onPatch({ editedText: draft });
    setMode("view");
  };

  if (s.status === "rejected") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-dashed border-border px-4 py-2.5 text-sm text-muted">
        <Icon className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">
          {meta.label}
          {item && ` · ${item.title || sectionTitle}`} — rejected
        </span>
        <Button size="sm" variant="ghost" onClick={() => onPatch({ status: "pending" })}>
          <Undo2 /> Undo
        </Button>
      </div>
    );
  }

  const accepted = s.status === "accepted";
  const label = s.type === "rewrite_block" || s.type === "insert_block" || s.type === "remove_block" ? `${meta.label} ${block?.type === "text" || s.blockType === "text" ? "paragraph" : "bullet"}` : meta.label;

  return (
    <div
      id={`sug-${s.id}`}
      className={cx(
        "scroll-mt-24 rounded-xl border bg-surface shadow-(--shadow-card) transition",
        focused ? "border-accent ring-2 ring-accent/30" : accepted ? "border-success/50 ring-1 ring-success/20" : "border-border",
      )}
    >
      <div className="flex flex-wrap items-center gap-2 px-4 pt-3.5">
        <span className={cx("flex size-7 items-center justify-center rounded-lg [&_svg]:size-3.5", accepted ? "bg-success/15 text-success" : "bg-accent-soft text-accent-soft-fg")}>
          {accepted ? <Check /> : <Icon />}
        </span>
        <span className="text-sm font-semibold">{label}</span>
        {item && (
          <span className="min-w-0 truncate text-xs text-muted">
            {sectionTitle} · {item.title || "untitled"}
            {item.subtitle && ` @ ${item.subtitle}`}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1.5">
          {edited && <span className="rounded-md bg-subtle px-1.5 py-0.5 text-[11px] font-medium text-muted">edited</span>}
          {delta !== null && delta !== 0 && (
            <span className={cx("rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums", delta > 0 ? "bg-success/12 text-success" : "bg-danger/10 text-danger")}>
              {delta > 0 ? "+" : ""}
              {delta} pts
            </span>
          )}
        </span>
      </div>

      <div className="px-4 py-3">
        {mode === "edit" ? (
          <div className="flex flex-col gap-2">
            {isTags ? (
              <Input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} />
            ) : (
              <Textarea autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} />
            )}
            <div className="flex gap-2">
              <Button size="sm" variant="primary" onClick={saveEdit}>
                Save edit
              </Button>
              {edited && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    onPatch({ editedText: null, editedTags: null });
                    setMode("view");
                  }}
                >
                  Restore suggestion
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setMode("view")}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <SuggestionDiff s={s} item={item} block={block} base={base} />
        )}

        {warnings.length > 0 && (
          <div className="mt-3 flex gap-2 rounded-lg bg-warn-bg px-3 py-2 text-xs text-warn-fg">
            <AlertTriangle className="mt-px size-3.5 shrink-0" />
            <div>
              <span className="font-semibold">Check before accepting. </span>
              This adds things your master profile doesn't mention:{" "}
              {warnings.map((w, i) => (
                <span key={i}>
                  {i > 0 && ", "}
                  <span className="font-semibold">{w.text}</span> <span className="opacity-75">({WARNING_LABEL[w.kind]})</span>
                </span>
              ))}
              . Only keep it if it's true.
            </div>
          </div>
        )}

        <p className="mt-3 text-xs text-muted">{s.rationale}</p>
        {requirements.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {requirements.slice(0, 3).map((r) => (
              <span key={r.id} className="max-w-full truncate rounded-md bg-subtle px-1.5 py-0.5 text-[11px] text-muted" title={r.text}>
                {r.mustHave ? "Must" : "Nice"}: {r.text}
              </span>
            ))}
            {requirements.length > 3 && (
              <span className="rounded-md px-1.5 py-0.5 text-[11px] text-muted" title={requirements.slice(3).map((r) => r.text).join("\n")}>
                +{requirements.length - 3} more
              </span>
            )}
          </div>
        )}
      </div>

      {mode === "regenerate" && (
        <form
          className="flex gap-2 border-t border-border px-4 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            onRegenerate(instruction);
            setInstruction("");
            setMode("view");
          }}
        >
          <Input
            autoFocus
            placeholder='How should it change? e.g. "keep the metric", "shorter", "less buzzwordy"'
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
          />
          <Button type="submit" variant="primary">
            <Wand2 /> Regenerate
          </Button>
          <Button variant="ghost" onClick={() => setMode("view")}>
            Cancel
          </Button>
        </form>
      )}

      {mode === "view" && (
        <div className="flex flex-wrap items-center gap-1 border-t border-border px-3 py-2">
          {accepted ? (
            <Button size="sm" variant="ghost" onClick={() => onPatch({ status: "pending" })}>
              <Undo2 /> Undo accept
            </Button>
          ) : (
            <>
              <Button size="sm" variant="primary" onClick={() => onPatch({ status: "accepted" })}>
                <Check /> Accept
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onPatch({ status: "rejected" })}>
                <X /> Reject
              </Button>
            </>
          )}
          <span className="ml-auto flex gap-1">
            <Button size="sm" variant={focused ? "soft" : "ghost"} onClick={onFocus} title="Highlight where this goes in the CV preview">
              <LocateFixed /> {focused ? "Shown in CV" : "Show in CV"}
            </Button>
            {editable && (
              <Button size="sm" variant="ghost" onClick={startEdit}>
                <Pencil /> Edit
              </Button>
            )}
            {editable && (
              <Button size="sm" variant="ghost" onClick={() => setMode("regenerate")} disabled={regenerating}>
                {regenerating ? <Spinner className="size-3" /> : <Wand2 />} {regenerating ? "Regenerating…" : "Regenerate"}
              </Button>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

function SuggestionDiff({ s, item, block, base }: { s: Suggestion; item: Item | null; block: Block | null; base: ProfileData }) {
  const box = "rounded-lg bg-subtle/70 px-3 py-2.5 text-sm leading-relaxed";
  switch (s.type) {
    case "rewrite_summary":
      return (
        <div className={box}>
          <WordDiff before={base.basics.summary} after={suggestionText(s)} />
        </div>
      );
    case "rewrite_headline":
      return (
        <div className={box}>
          <WordDiff before={base.basics.headline} after={suggestionText(s)} />
        </div>
      );
    case "rewrite_block":
      return (
        <div className={box}>
          {block?.type === "bullet" && <span className="mr-1.5 text-muted">•</span>}
          <WordDiff before={block?.text ?? ""} after={suggestionText(s)} />
        </div>
      );
    case "insert_block": {
      const after = item?.content.find((b) => b.id === s.afterBlockId);
      return (
        <div className="flex flex-col gap-1.5">
          <div className={cx(box, "bg-success/10")}>
            {s.blockType === "bullet" ? <span className="mr-1.5 text-success">•</span> : <List className="mr-1.5 inline size-3.5 text-success" />}
            <span className="text-success">{suggestionText(s)}</span>
          </div>
          <span className="text-xs text-muted">{after ? `Inserted after: “${after.text.slice(0, 70)}${after.text.length > 70 ? "…" : ""}”` : "Inserted at the start of the entry"}</span>
        </div>
      );
    }
    case "remove_block":
      return (
        <div className={box}>
          <del className="text-danger decoration-danger/60">{block?.text}</del>
        </div>
      );
    case "set_tags":
      return (
        <div className={box}>
          <TagsDiff before={item?.tags ?? []} after={suggestionTags(s)} />
        </div>
      );
    case "hide_item":
      return <div className={box}>Hide “{item?.title}{item?.subtitle && ` @ ${item.subtitle}`}” from this application. It stays in your master profile.</div>;
    case "show_item":
      return <div className={box}>Show the hidden entry “{item?.title}” in this application.</div>;
    case "move_item": {
      const section = base.sections.find((sec) => sec.items.some((i) => i.id === s.itemId));
      const from = section?.items.findIndex((i) => i.id === s.itemId) ?? 0;
      return (
        <div className={box}>
          Move “{item?.title}” from position {from + 1} to {s.toIndex + 1} in {section?.title}.
        </div>
      );
    }
  }
}
