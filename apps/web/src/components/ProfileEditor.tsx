import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  List,
  Pilcrow,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  KIND_META,
  SECTION_KINDS,
  SECTION_TITLES,
  emptyItem,
  emptySection,
  formatCvDateRange,
  newBlock,
  type Basics,
  type Block,
  type BlockType,
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
  const [openItemIds, setOpenItemIds] = useState<Set<string>>(new Set());
  const toggleItem = (id: string) =>
    setOpenItemIds((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });

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

  const addItem = (section: Section) => {
    const item = emptyItem();
    setOpenItemIds((s) => new Set(s).add(item.id));
    updateSection(section.id, { items: [...section.items, item] });
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
          openItemIds={openItemIds}
          onToggleItem={toggleItem}
          onChange={(patch) => updateSection(section.id, patch)}
          onMove={(dir) => setSections(move(value.sections, idx, idx + dir))}
          onDelete={() => {
            if (section.items.length === 0 || confirm(`Delete section "${section.title}" and its ${section.items.length} entries?`)) {
              setSections(value.sections.filter((s) => s.id !== section.id));
            }
          }}
          onAddItem={() => addItem(section)}
          onMoveItemTo={(item, toId) => moveItemToSection(item, section.id, toId)}
        />
      ))}

      <AddSection onAdd={(kind) => setSections([...value.sections, emptySection(kind, language)])} />
    </div>
  );
}

function AddSection({ onAdd }: { onAdd: (k: SectionKind) => void }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-4">
      <div className="mb-2 text-xs font-medium text-muted">Add a section</div>
      <div className="flex flex-wrap gap-2">
        {SECTION_KINDS.map((k) => (
          <Button key={k} size="sm" variant="secondary" onClick={() => onAdd(k)}>
            <Plus /> {KIND_META[k].label}
          </Button>
        ))}
      </div>
    </div>
  );
}

function BasicsEditor({ value, onChange }: { value: Basics; onChange: (b: Basics) => void }) {
  const set = <K extends keyof Basics>(k: K, v: Basics[K]) => onChange({ ...value, [k]: v });
  return (
    <Card className="p-5">
      <h2 className="mb-4 font-semibold">Personal details</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name">
          <Input value={value.fullName} onChange={(e) => set("fullName", e.target.value)} />
        </Field>
        <Field label="Headline">
          <Input value={value.headline} placeholder="e.g. Senior DevOps Engineer" onChange={(e) => set("headline", e.target.value)} />
        </Field>
        <Field label="Email">
          <Input value={value.email} onChange={(e) => set("email", e.target.value)} />
        </Field>
        <Field label="Phone">
          <Input value={value.phone} onChange={(e) => set("phone", e.target.value)} />
        </Field>
        <Field label="Location" className="sm:col-span-2">
          <Input value={value.location} placeholder="City, Country" onChange={(e) => set("location", e.target.value)} />
        </Field>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-xs font-medium text-muted">Links</span>
          {value.links.map((link, i) => (
            <div key={i} className="flex gap-2">
              <Input
                className="w-36"
                placeholder="LinkedIn"
                value={link.label}
                onChange={(e) => set("links", value.links.map((l, j) => (j === i ? { ...l, label: e.target.value } : l)))}
              />
              <Input
                placeholder="https://…"
                value={link.url}
                onChange={(e) => set("links", value.links.map((l, j) => (j === i ? { ...l, url: e.target.value } : l)))}
              />
              <Button variant="ghost" size="icon" className="mt-0.5" onClick={() => set("links", value.links.filter((_, j) => j !== i))} aria-label="Remove link">
                <X />
              </Button>
            </div>
          ))}
          <div>
            <Button size="sm" variant="ghost" onClick={() => set("links", [...value.links, { label: "", url: "" }])}>
              <Plus /> Add link
            </Button>
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
  openItemIds: Set<string>;
  onToggleItem: (id: string) => void;
  onChange: (patch: Partial<Section>) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
  onAddItem: () => void;
  onMoveItemTo: (item: Item, sectionId: string) => void;
}

function SectionEditor(props: SectionEditorProps) {
  const { section, language, otherSections, isFirst, isLast, openItemIds, onToggleItem, onChange, onMove, onDelete, onAddItem, onMoveItemTo } = props;
  const [collapsed, setCollapsed] = useState(false);
  const setItems = (items: Item[]) => onChange({ items });

  const changeKind = (kind: SectionKind) => {
    // Keep a custom heading; swap a default heading for the new kind's default.
    const isDefaultTitle = section.title === SECTION_TITLES[language][section.kind] || !section.title.trim();
    onChange({ kind, ...(isDefaultTitle ? { title: SECTION_TITLES[language][kind] } : {}) });
  };

  return (
    <Card className={cx("overflow-hidden", section.hidden && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <Button variant="ghost" size="icon" onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? "Expand" : "Collapse"}>
          {collapsed ? <ChevronRight /> : <ChevronDown />}
        </Button>
        <input
          className="min-w-0 flex-1 rounded-md bg-transparent px-1 py-1 font-semibold outline-none hover:bg-subtle focus:bg-subtle"
          value={section.title}
          onChange={(e) => onChange({ title: e.target.value })}
          aria-label="Section heading"
        />
        <Select className="h-8 w-auto py-0 text-xs" value={section.kind} onChange={(e) => changeKind(e.target.value as SectionKind)} aria-label="Section type">
          {SECTION_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_META[k].label}
            </option>
          ))}
        </Select>
        <div className="flex items-center">
          <Button variant="ghost" size="icon" onClick={() => onChange({ hidden: !section.hidden })} title={section.hidden ? "Show in CV" : "Hide from CV"}>
            {section.hidden ? <EyeOff /> : <Eye />}
          </Button>
          <Button variant="ghost" size="icon" disabled={isFirst} onClick={() => onMove(-1)} title="Move section up">
            <ArrowUp />
          </Button>
          <Button variant="ghost" size="icon" disabled={isLast} onClick={() => onMove(1)} title="Move section down">
            <ArrowDown />
          </Button>
          <Button variant="danger" size="icon" onClick={onDelete} title="Delete section">
            <Trash2 />
          </Button>
        </div>
      </div>
      {!collapsed && (
        <div className="flex flex-col gap-2 border-t border-border bg-subtle/40 p-3">
          {section.items.map((item, idx) => (
            <ItemEditor
              key={item.id}
              item={item}
              kind={section.kind}
              language={language}
              open={openItemIds.has(item.id)}
              onToggle={() => onToggleItem(item.id)}
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
            <Button size="sm" variant="soft" onClick={onAddItem}>
              <Plus /> Add entry
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
  language: Language;
  open: boolean;
  onToggle: () => void;
  otherSections: Section[];
  isFirst: boolean;
  isLast: boolean;
  onChange: (patch: Partial<Item>) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
  onMoveTo: (sectionId: string) => void;
}

function ItemEditor({ item, kind, language, open, onToggle, otherSections, isFirst, isLast, onChange, onMove, onDelete, onMoveTo }: ItemEditorProps) {
  const f = KIND_META[kind].fields;
  const preview = !f.dates && f.tags ? item.tags.join(", ") : "";
  const heading = [item.title || (preview ? "" : "Untitled"), item.subtitle].filter(Boolean).join(" · ");
  const dates = f.dates ? formatCvDateRange(item.startDate, item.endDate, item.current, language) : "";

  return (
    <div className={cx("rounded-lg border border-border bg-surface", item.hidden && "opacity-60")}>
      <div className="group flex items-center gap-1 py-1.5 pr-1.5 pl-3">
        <button type="button" className="flex min-w-0 flex-1 items-baseline gap-2 py-1 text-left" onClick={onToggle}>
          {heading && <span className="max-w-[70%] shrink-0 truncate text-sm font-medium">{heading}</span>}
          {dates && <span className="shrink-0 text-xs text-muted">{dates}</span>}
          {preview && <span className="min-w-0 truncate text-xs text-muted">{preview}</span>}
          {item.hidden && <span className="shrink-0 text-xs text-muted">· hidden</span>}
        </button>
        <div className="flex opacity-60 transition group-hover:opacity-100">
          <Button variant="ghost" size="icon" disabled={isFirst} onClick={() => onMove(-1)} title="Move up">
            <ArrowUp />
          </Button>
          <Button variant="ghost" size="icon" disabled={isLast} onClick={() => onMove(1)} title="Move down">
            <ArrowDown />
          </Button>
          <Button variant="ghost" size="icon" onClick={onToggle} title={open ? "Collapse" : "Edit"}>
            {open ? <ChevronDown /> : <ChevronRight />}
          </Button>
        </div>
      </div>

      {open && (
        <div className="grid gap-4 border-t border-border p-4 sm:grid-cols-2">
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
              <Field label="Start" className="flex-1">
                <Input value={item.startDate} placeholder="YYYY-MM" onChange={(e) => onChange({ startDate: e.target.value })} />
              </Field>
              <Field label="End" className="flex-1">
                <Input
                  value={item.current ? "" : item.endDate}
                  disabled={item.current}
                  placeholder={item.current ? "Present" : "YYYY-MM"}
                  onChange={(e) => onChange({ endDate: e.target.value })}
                />
              </Field>
              <label className="flex h-9 items-center gap-1.5 text-xs whitespace-nowrap text-muted">
                <input type="checkbox" className="accent-accent" checked={item.current} onChange={(e) => onChange({ current: e.target.checked })} />
                Current
              </label>
            </div>
          )}
          {f.url && (
            <Field label="URL">
              <Input value={item.url} onChange={(e) => onChange({ url: e.target.value })} />
            </Field>
          )}
          {f.content && (
            <div className="sm:col-span-2">
              <ContentEditor blocks={item.content} onChange={(content) => onChange({ content })} />
            </div>
          )}
          {f.tags && (
            <Field label={`${f.tags} (comma-separated)`} className="sm:col-span-2">
              <TagsInput tags={item.tags} onChange={(tags) => onChange({ tags })} />
            </Field>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3 sm:col-span-2">
            <Button size="sm" variant="ghost" onClick={() => onChange({ hidden: !item.hidden })}>
              {item.hidden ? <Eye /> : <EyeOff />}
              {item.hidden ? "Show in CV" : "Hide from CV"}
            </Button>
            {otherSections.length > 0 && (
              <Select
                className="h-8 w-auto py-0 text-xs"
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
              <Trash2 /> Delete entry
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Ordered paragraphs and bullets. Enter in a bullet starts the next bullet,
 * Backspace in an empty block removes it; the type toggle converts in place.
 */
function ContentEditor({ blocks, onChange }: { blocks: Block[]; onChange: (b: Block[]) => void }) {
  const refs = useRef(new Map<string, HTMLTextAreaElement>());
  const [focusId, setFocusId] = useState<string | null>(null);

  useEffect(() => {
    if (!focusId) return;
    refs.current.get(focusId)?.focus();
    setFocusId(null);
  }, [focusId]);

  const update = (id: string, patch: Partial<Block>) => onChange(blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  const insertAfter = (idx: number, type: BlockType) => {
    const b = newBlock(type);
    onChange([...blocks.slice(0, idx + 1), b, ...blocks.slice(idx + 1)]);
    setFocusId(b.id);
  };
  const remove = (idx: number) => {
    onChange(blocks.filter((_, i) => i !== idx));
    const prev = blocks[idx - 1];
    if (prev) setFocusId(prev.id);
  };

  return (
    <div>
      <span className="text-xs font-medium text-muted">Content</span>
      <div className="mt-1.5 flex flex-col gap-1.5">
        {blocks.length === 0 && <p className="text-xs text-muted">No content yet. Add a paragraph or bullet points, in any order.</p>}
        {blocks.map((b, i) => (
          <div key={b.id} className="group flex items-start gap-1">
            <button
              type="button"
              onClick={() => update(b.id, { type: b.type === "bullet" ? "text" : "bullet" })}
              title={b.type === "bullet" ? "Bullet point (click for paragraph)" : "Paragraph (click for bullet)"}
              className={cx(
                "mt-1 flex size-7 shrink-0 items-center justify-center rounded-md transition [&_svg]:size-3.5",
                b.type === "bullet" ? "text-accent hover:bg-accent-soft" : "text-muted hover:bg-subtle",
              )}
            >
              {b.type === "bullet" ? <span className="text-lg leading-none">•</span> : <Pilcrow />}
            </button>
            <Textarea
              ref={(el) => {
                if (el) refs.current.set(b.id, el);
                else refs.current.delete(b.id);
              }}
              value={b.text}
              placeholder={b.type === "bullet" ? "Achievement or responsibility" : "Paragraph"}
              onChange={(e) => update(b.id, { text: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && b.type === "bullet") {
                  e.preventDefault();
                  insertAfter(i, "bullet");
                } else if (e.key === "Backspace" && b.text === "") {
                  e.preventDefault();
                  remove(i);
                }
              }}
            />
            <div className="mt-0.5 flex opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100">
              <Button variant="ghost" size="icon" disabled={i === 0} onClick={() => onChange(move(blocks, i, i - 1))} title="Move up">
                <ArrowUp />
              </Button>
              <Button variant="ghost" size="icon" disabled={i === blocks.length - 1} onClick={() => onChange(move(blocks, i, i + 1))} title="Move down">
                <ArrowDown />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => remove(i)} title="Remove">
                <X />
              </Button>
            </div>
          </div>
        ))}
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => insertAfter(blocks.length - 1, "text")}>
            <Pilcrow /> Paragraph
          </Button>
          <Button size="sm" variant="ghost" onClick={() => insertAfter(blocks.length - 1, "bullet")}>
            <List /> Bullet
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
