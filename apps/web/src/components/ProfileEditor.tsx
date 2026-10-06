import { useState } from "react";
import {
  KIND_META,
  SECTION_KINDS,
  SECTION_TITLES,
  emptyItem,
  emptySection,
  type Basics,
  type Item,
  type Language,
  type ProfileData,
  type Section,
  type SectionKind,
} from "@rb/shared";
import { Button, Card, Field, Input, Select, Textarea, cx } from "./ui";

interface Props {
  value: ProfileData;
  onChange: (next: ProfileData) => void;
  language: Language;
}

function move<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length) return arr;
  const next = arr.slice();
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x!);
  return next;
}

export function ProfileEditor({ value, onChange, language }: Props) {
  const [newItemIds, setNewItemIds] = useState<Set<string>>(new Set());

  const setSections = (sections: Section[]) => onChange({ ...value, sections });
  const updateSection = (id: string, patch: Partial<Section>) =>
    setSections(value.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const moveItemToSection = (item: Item, fromId: string, toId: string) =>
    setSections(
      value.sections.map((s) => {
        if (s.id === fromId) return { ...s, items: s.items.filter((i) => i.id !== item.id) };
        if (s.id === toId) return { ...s, items: [...s.items, item] };
        return s;
      }),
    );

  const addSection = (kind: SectionKind) => setSections([...value.sections, emptySection(kind, language)]);

  const addItem = (sectionId: string) => {
    const item = emptyItem();
    setNewItemIds((s) => new Set(s).add(item.id));
    const section = value.sections.find((s) => s.id === sectionId)!;
    updateSection(sectionId, { items: [...section.items, item] });
  };

  return (
    <div className="flex flex-col gap-4">
      <BasicsEditor value={value.basics} onChange={(basics) => onChange({ ...value, basics })} />

      {value.sections.map((section, idx) => (
        <SectionEditor
          key={section.id}
          section={section}
          language={language}
          otherSections={value.sections.filter((s) => s.id !== section.id)}
          isFirst={idx === 0}
          isLast={idx === value.sections.length - 1}
          newItemIds={newItemIds}
          onChange={(patch) => updateSection(section.id, patch)}
          onMove={(dir) => setSections(move(value.sections, idx, idx + dir))}
          onDelete={() => {
            if (section.items.length === 0 || confirm(`Delete section "${section.title}" and its ${section.items.length} entries?`)) {
              setSections(value.sections.filter((s) => s.id !== section.id));
            }
          }}
          onAddItem={() => addItem(section.id)}
          onMoveItemTo={(item, toId) => moveItemToSection(item, section.id, toId)}
        />
      ))}

      <AddSection onAdd={addSection} />
    </div>
  );
}

function AddSection({ onAdd }: { onAdd: (k: SectionKind) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border p-3">
      <span className="text-sm text-muted">Add section:</span>
      {SECTION_KINDS.map((k) => (
        <Button key={k} size="sm" onClick={() => onAdd(k)}>
          + {KIND_META[k].label}
        </Button>
      ))}
    </div>
  );
}

function BasicsEditor({ value, onChange }: { value: Basics; onChange: (b: Basics) => void }) {
  const set = <K extends keyof Basics>(k: K, v: Basics[K]) => onChange({ ...value, [k]: v });
  return (
    <Card className="p-4">
      <h2 className="mb-3 text-sm font-semibold">Personal details</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Full name">
          <Input value={value.fullName} onChange={(e) => set("fullName", e.target.value)} />
        </Field>
        <Field label="Headline (professional title)">
          <Input value={value.headline} onChange={(e) => set("headline", e.target.value)} />
        </Field>
        <Field label="Email">
          <Input value={value.email} onChange={(e) => set("email", e.target.value)} />
        </Field>
        <Field label="Phone">
          <Input value={value.phone} onChange={(e) => set("phone", e.target.value)} />
        </Field>
        <Field label="Location" className="sm:col-span-2">
          <Input value={value.location} onChange={(e) => set("location", e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <span className="text-xs font-medium text-muted">Links</span>
          <div className="mt-1 flex flex-col gap-2">
            {value.links.map((link, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  className="w-40"
                  placeholder="LinkedIn"
                  value={link.label}
                  onChange={(e) => set("links", value.links.map((l, j) => (j === i ? { ...l, label: e.target.value } : l)))}
                />
                <Input
                  placeholder="https://…"
                  value={link.url}
                  onChange={(e) => set("links", value.links.map((l, j) => (j === i ? { ...l, url: e.target.value } : l)))}
                />
                <Button variant="ghost" onClick={() => set("links", value.links.filter((_, j) => j !== i))} aria-label="Remove link">
                  ✕
                </Button>
              </div>
            ))}
            <div>
              <Button size="sm" onClick={() => set("links", [...value.links, { label: "", url: "" }])}>
                + Link
              </Button>
            </div>
          </div>
        </div>
        <Field label="Summary" className="sm:col-span-2">
          <Textarea value={value.summary} onChange={(e) => set("summary", e.target.value)} />
        </Field>
      </div>
    </Card>
  );
}

interface SectionEditorProps {
  section: Section;
  language: Language;
  otherSections: Section[];
  isFirst: boolean;
  isLast: boolean;
  newItemIds: Set<string>;
  onChange: (patch: Partial<Section>) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
  onAddItem: () => void;
  onMoveItemTo: (item: Item, sectionId: string) => void;
}

function SectionEditor({ section, language, otherSections, isFirst, isLast, newItemIds, onChange, onMove, onDelete, onAddItem, onMoveItemTo }: SectionEditorProps) {
  const [collapsed, setCollapsed] = useState(false);
  const setItems = (items: Item[]) => onChange({ items });

  const changeKind = (kind: SectionKind) => {
    // Keep a custom heading; swap a default heading for the new kind's default.
    const isDefaultTitle = section.title === SECTION_TITLES[language][section.kind] || !section.title.trim();
    onChange({ kind, ...(isDefaultTitle ? { title: SECTION_TITLES[language][kind] } : {}) });
  };

  return (
    <Card className={cx(section.hidden && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <Button variant="ghost" size="sm" onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? "Expand" : "Collapse"}>
          {collapsed ? "▸" : "▾"}
        </Button>
        <Input className="max-w-xs font-semibold" value={section.title} onChange={(e) => onChange({ title: e.target.value })} aria-label="Section heading" />
        <Select className="w-auto" value={section.kind} onChange={(e) => changeKind(e.target.value as SectionKind)} aria-label="Section type">
          {SECTION_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_META[k].label}
            </option>
          ))}
        </Select>
        <span className="text-xs text-muted">
          {section.items.length} {section.items.length === 1 ? "entry" : "entries"}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => onChange({ hidden: !section.hidden })}>
            {section.hidden ? "Show in CV" : "Hide from CV"}
          </Button>
          <Button variant="ghost" size="sm" disabled={isFirst} onClick={() => onMove(-1)} aria-label="Move section up">
            ↑
          </Button>
          <Button variant="ghost" size="sm" disabled={isLast} onClick={() => onMove(1)} aria-label="Move section down">
            ↓
          </Button>
          <Button variant="danger" size="sm" onClick={onDelete}>
            Delete
          </Button>
        </div>
      </div>
      {!collapsed && (
        <div className="flex flex-col gap-2 p-3">
          {section.items.map((item, idx) => (
            <ItemEditor
              key={item.id}
              item={item}
              kind={section.kind}
              initiallyOpen={newItemIds.has(item.id)}
              otherSections={otherSections}
              isFirst={idx === 0}
              isLast={idx === section.items.length - 1}
              onChange={(patch) => setItems(section.items.map((i) => (i.id === item.id ? { ...i, ...patch } : i)))}
              onMove={(dir) => setItems(move(section.items, idx, idx + dir))}
              onDelete={() => setItems(section.items.filter((i) => i.id !== item.id))}
              onMoveTo={(sectionId) => onMoveItemTo(item, sectionId)}
            />
          ))}
          <div>
            <Button size="sm" onClick={onAddItem}>
              + Entry
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

interface ItemEditorProps {
  item: Item;
  kind: SectionKind;
  initiallyOpen: boolean;
  otherSections: Section[];
  isFirst: boolean;
  isLast: boolean;
  onChange: (patch: Partial<Item>) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
  onMoveTo: (sectionId: string) => void;
}

function formatRange(item: Item) {
  const end = item.current ? "present" : item.endDate;
  return [item.startDate, end].filter(Boolean).join(" – ");
}

function ItemEditor({ item, kind, initiallyOpen, otherSections, isFirst, isLast, onChange, onMove, onDelete, onMoveTo }: ItemEditorProps) {
  const [open, setOpen] = useState(initiallyOpen);
  const f = KIND_META[kind].fields;
  const summary = [item.title || "Untitled", item.subtitle].filter(Boolean).join(" · ");
  const dates = f.dates ? formatRange(item) : "";

  return (
    <div className={cx("rounded-md border border-border", item.hidden && "opacity-60")}>
      <div className="flex items-center gap-2 px-3 py-2">
        <button type="button" className="flex min-w-0 flex-1 items-baseline gap-2 text-left" onClick={() => setOpen((o) => !o)}>
          <span className="text-muted">{open ? "▾" : "▸"}</span>
          <span className="truncate text-sm font-medium">{summary}</span>
          {dates && <span className="shrink-0 text-xs text-muted">{dates}</span>}
          {!open && f.tags && item.tags.length > 0 && <span className="truncate text-xs text-muted">{item.tags.join(", ")}</span>}
          {item.hidden && <span className="shrink-0 rounded bg-subtle px-1.5 text-xs text-muted">hidden</span>}
        </button>
        <Button variant="ghost" size="sm" disabled={isFirst} onClick={() => onMove(-1)} aria-label="Move entry up">
          ↑
        </Button>
        <Button variant="ghost" size="sm" disabled={isLast} onClick={() => onMove(1)} aria-label="Move entry down">
          ↓
        </Button>
      </div>

      {open && (
        <div className="grid gap-3 border-t border-border p-3 sm:grid-cols-2">
          <Field label={f.title}>
            <Input value={item.title} onChange={(e) => onChange({ title: e.target.value })} />
          </Field>
          {f.subtitle && (
            <Field label={f.subtitle}>
              <Input value={item.subtitle} onChange={(e) => onChange({ subtitle: e.target.value })} />
            </Field>
          )}
          {f.location && (
            <Field label={f.location}>
              <Input value={item.location} onChange={(e) => onChange({ location: e.target.value })} />
            </Field>
          )}
          {f.dates && (
            <div className="flex items-end gap-2">
              <Field label="Start (YYYY-MM)" className="flex-1">
                <Input value={item.startDate} placeholder="2021-04" onChange={(e) => onChange({ startDate: e.target.value })} />
              </Field>
              <Field label="End" className="flex-1">
                <Input value={item.current ? "" : item.endDate} disabled={item.current} placeholder={item.current ? "present" : "2024-01"} onChange={(e) => onChange({ endDate: e.target.value })} />
              </Field>
              <label className="flex h-9 items-center gap-1.5 text-xs text-muted">
                <input type="checkbox" checked={item.current} onChange={(e) => onChange({ current: e.target.checked })} />
                Current
              </label>
            </div>
          )}
          {f.url && (
            <Field label="URL">
              <Input value={item.url} onChange={(e) => onChange({ url: e.target.value })} />
            </Field>
          )}
          {f.description && (
            <Field label="Description" className="sm:col-span-2">
              <Textarea value={item.description} onChange={(e) => onChange({ description: e.target.value })} />
            </Field>
          )}
          {f.bullets && (
            <div className="sm:col-span-2">
              <BulletsEditor bullets={item.bullets} onChange={(bullets) => onChange({ bullets })} />
            </div>
          )}
          {f.tags && (
            <Field label={`${f.tags} (comma-separated)`} className="sm:col-span-2">
              <TagsInput tags={item.tags} onChange={(tags) => onChange({ tags })} />
            </Field>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3 sm:col-span-2">
            <Button size="sm" variant="ghost" onClick={() => onChange({ hidden: !item.hidden })}>
              {item.hidden ? "Show in CV" : "Hide from CV"}
            </Button>
            {otherSections.length > 0 && (
              <Select
                className="h-7 w-auto py-0 text-xs"
                value=""
                onChange={(e) => e.target.value && onMoveTo(e.target.value)}
                aria-label="Move entry to another section"
              >
                <option value="">Move to section…</option>
                {otherSections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title || KIND_META[s.kind].label}
                  </option>
                ))}
              </Select>
            )}
            <Button size="sm" variant="danger" className="ml-auto" onClick={onDelete}>
              Delete entry
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function BulletsEditor({ bullets, onChange }: { bullets: string[]; onChange: (b: string[]) => void }) {
  return (
    <div>
      <span className="text-xs font-medium text-muted">Bullet points</span>
      <div className="mt-1 flex flex-col gap-1.5">
        {bullets.map((b, i) => (
          <div key={i} className="flex items-start gap-1">
            <span className="pt-1.5 text-muted">•</span>
            <Textarea value={b} onChange={(e) => onChange(bullets.map((x, j) => (j === i ? e.target.value : x)))} />
            <Button variant="ghost" size="sm" className="mt-1" disabled={i === 0} onClick={() => onChange(move(bullets, i, i - 1))} aria-label="Move bullet up">
              ↑
            </Button>
            <Button variant="ghost" size="sm" className="mt-1" onClick={() => onChange(bullets.filter((_, j) => j !== i))} aria-label="Remove bullet">
              ✕
            </Button>
          </div>
        ))}
        <div>
          <Button size="sm" onClick={() => onChange([...bullets, ""])}>
            + Bullet
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Edits a string list as comma-separated text; only splits on blur so typing stays natural. */
function TagsInput({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const [text, setText] = useState<string | null>(null);
  return (
    <Input
      value={text ?? tags.join(", ")}
      onFocus={() => setText(tags.join(", "))}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (text !== null) onChange(text.split(",").map((t) => t.trim()).filter(Boolean));
        setText(null);
      }}
    />
  );
}
