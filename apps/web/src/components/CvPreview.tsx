import { createContext, useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CV_LABELS, formatCvDateRange, type Block, type ChangeSet, type Item, type Language, type ProfileData, type Section } from "@rb/shared";
import { cx } from "./ui";
import { TagsDiff, WordDiff } from "./WordDiff";

/**
 * A4 at 96 dpi. The preview and the PDF (/print page) both paginate with
 * `paginate()` below, so page breaks in the preview match the export exactly.
 */
export const PAGE_W = 794;
export const PAGE_H = 1122.5;
const MARGIN_X = 57; // 15 mm
const MARGIN_Y = 45; // 12 mm
const CONTENT_W = PAGE_W - 2 * MARGIN_X;
const CONTENT_H = PAGE_H - 2 * MARGIN_Y;
const PAGE_GAP = 28;

/** When set, the document highlights what changed relative to the base profile. */
const ChangesContext = createContext<ChangeSet | null>(null);
/** Suggestion whose change should be outlined (the "Show in CV" target). */
const FocusContext = createContext<string | null>(null);

const ADDED = "bg-[#d9f5e6]";
const REMOVED = "bg-[#fde3df] text-[#9c2a14] line-through";
const TEXT_STYLE = { fontVariantLigatures: "none", fontFeatureSettings: '"liga" 0, "calt" 0' } as const;

// --- Units: the smallest pieces a page break may fall between ----------------------

interface Unit {
  key: string;
  node: ReactNode;
  /** Space above, dropped when the unit starts a page. */
  pad: number;
  /** Never end a page right after this unit (headings, entry headers). */
  keepWithNext?: boolean;
  /** Suggestion that produced this unit's change, for "Show in CV". */
  sug?: string;
  /** Extra classes, e.g. hidden/moved markers spanning all units of an entry. */
  className?: string;
}

function itemMark(changes: ChangeSet | null, item: Item): string | undefined {
  switch (changes?.items[item.id]) {
    case "hidden":
      return "opacity-55 [&_*]:line-through [&_*]:decoration-[#c4320a]";
    case "shown":
      return ADDED;
    case "moved":
      return "border-l-2 border-[#4f46e5] pl-2.5 -ml-3";
  }
}

function buildUnits(data: ProfileData, language: Language, changes: ChangeSet | null): Unit[] {
  const { basics } = data;
  const units: Unit[] = [];
  const contact = [basics.location, basics.phone, basics.email, ...basics.links.map((l) => l.url)].filter(Boolean);
  const headline = changes?.headline !== undefined ? <WordDiff paper before={changes.headline} after={basics.headline} /> : basics.headline;

  units.push({
    key: "header",
    pad: 0,
    sug: changes?.sources.headline,
    node: (
      <header>
        <h1 className="text-[22pt] leading-tight font-bold tracking-tight">{basics.fullName || "Your Name"}</h1>
        {(basics.headline || changes?.headline) && <div className="mt-0.5 text-[12pt] font-medium text-[#4f46e5]">{headline}</div>}
        {contact.length > 0 && <div className="mt-1.5 text-[9.5pt] text-[#55556a]">{contact.join("  ·  ")}</div>}
      </header>
    ),
  });

  const heading = (key: string, title: string) =>
    units.push({
      key,
      pad: 16,
      keepWithNext: true,
      node: <h2 className="border-b border-[#d8d8e2] pb-1 text-[10pt] font-bold tracking-[0.08em] text-[#1d1d24] uppercase">{title}</h2>,
    });

  if (basics.summary || changes?.summary) {
    heading("summary-h", CV_LABELS[language].summary);
    units.push({
      key: "summary",
      pad: 6,
      sug: changes?.sources.summary,
      node: <p className="whitespace-pre-line">{changes?.summary !== undefined ? <WordDiff paper before={changes.summary} after={basics.summary} /> : basics.summary}</p>,
    });
  }

  for (const section of data.sections) {
    const items = section.items.filter((i) => !i.hidden);
    if (section.hidden || !items.length) continue;
    heading(`h-${section.id}`, section.title);
    sectionUnits(section, items, language, changes, units);
  }
  return units;
}

function sectionUnits(section: Section, items: Item[], language: Language, changes: ChangeSet | null, units: Unit[]) {
  if (section.kind === "skills") {
    items.forEach((i, idx) =>
      units.push({
        key: i.id,
        pad: idx === 0 ? 6 : 2,
        sug: changes?.sources[`tags:${i.id}`] ?? changes?.sources[i.id],
        className: itemMark(changes, i),
        node: (
          <p>
            {i.title && <span className="font-semibold">{i.title}: </span>}
            <Tags item={i} />
          </p>
        ),
      }),
    );
    return;
  }
  if (section.kind === "languages") {
    units.push({
      key: section.id,
      pad: 6,
      node: (
        <p>
          {items.map((i, idx) => (
            <span key={i.id} className={itemMark(changes, i)}>
              {idx > 0 && "  ·  "}
              {i.subtitle ? `${i.title} (${i.subtitle})` : i.title}
            </span>
          ))}
        </p>
      ),
    });
    return;
  }

  items.forEach((item, idx) => {
    const mark = itemMark(changes, item);
    const dates = formatCvDateRange(item.startDate, item.endDate, item.current, language);
    const sub = [item.subtitle, item.location].filter(Boolean).join(" | ");
    units.push({
      key: `${item.id}-head`,
      pad: idx === 0 ? 6 : 12,
      keepWithNext: true,
      sug: changes?.sources[item.id],
      className: mark,
      node: (
        <div>
          <div className="flex items-baseline justify-between gap-4">
            <div className="font-semibold">{item.title}</div>
            {dates && <div className="shrink-0 text-[9.5pt] text-[#55556a]">{dates}</div>}
          </div>
          {sub && <div className="text-[#3a3a4a] italic">{sub}</div>}
          {item.url && <div className="text-[9.5pt] text-[#55556a]">{item.url}</div>}
        </div>
      ),
    });
    for (const b of item.content) {
      if (!b.text.trim()) continue;
      units.push({
        key: b.id,
        pad: b.type === "bullet" ? 2 : 3,
        sug: changes?.sources[b.id],
        className: mark,
        node:
          b.type === "bullet" ? (
            <ul className="ml-4 list-disc marker:text-[#7a7a90]">
              <li className="pl-0.5">
                <BlockText block={b} changes={changes} />
              </li>
            </ul>
          ) : (
            <p className="whitespace-pre-line">
              <BlockText block={b} changes={changes} />
            </p>
          ),
      });
    }
    if (section.kind !== "custom" && item.tags.length) {
      units.push({
        key: `${item.id}-tags`,
        pad: 3,
        sug: changes?.sources[`tags:${item.id}`],
        className: mark,
        node: (
          <p className="text-[9.5pt] text-[#3a3a4a]">
            <span className="font-semibold">{CV_LABELS[language].tags}: </span>
            <Tags item={item} />
          </p>
        ),
      });
    }
  });
}

function Tags({ item }: { item: Item }) {
  const before = useContext(ChangesContext)?.tags[item.id];
  return before ? <TagsDiff paper before={before} after={item.tags} /> : <>{item.tags.join(", ")}</>;
}

function BlockText({ block, changes }: { block: Block; changes: ChangeSet | null }) {
  const change = changes?.blocks[block.id];
  if (!change) return <>{block.text}</>;
  if (change.kind === "changed") return <WordDiff paper before={change.before} after={block.text} />;
  return <span className={change.kind === "added" ? ADDED : REMOVED}>{block.text}</span>;
}

// --- Pagination ----------------------------------------------------------------------

/**
 * Greedy page fill. A unit with keepWithNext travels to the next page together
 * with what follows it, so headings and entry headers are never stranded.
 */
export function paginate(units: Pick<Unit, "pad" | "keepWithNext">[], heights: number[]): number[][] {
  const pages: number[][] = [[]];
  let used = 0;
  let i = 0;
  while (i < units.length) {
    let j = i;
    while (j < units.length - 1 && units[j]!.keepWithNext) j++;
    const groupHeight = (atTop: boolean) => {
      let h = 0;
      for (let k = i; k <= j; k++) h += heights[k]! + (k === i && atTop ? 0 : units[k]!.pad);
      return h;
    };
    if (used > 0 && used + groupHeight(false) > CONTENT_H) {
      pages.push([]);
      used = 0;
    }
    used += groupHeight(used === 0);
    for (let k = i; k <= j; k++) pages.at(-1)!.push(k);
    i = j + 1;
  }
  return pages;
}

/** Measures every unit offscreen, then lays them out on A4 pages. */
function usePages(units: Unit[]): { pages: number[][] | null; measurer: ReactNode } {
  const box = useRef<HTMLDivElement>(null);
  // Layout is only valid for the units it was measured from: after an edit
  // (e.g. a removed entry) old indexes may point past the new units.
  const [layout, setLayout] = useState<{ units: Unit[]; pages: number[][] } | null>(null);
  const [fontsTick, setFontsTick] = useState(0);

  useLayoutEffect(() => {
    void document.fonts.ready.then(() => setFontsTick((t) => t + 1));
  }, []);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    // The measurer may sit inside a scaled container; undo the scale.
    const scale = el.getBoundingClientRect().width / CONTENT_W || 1;
    const heights = Array.from(el.children, (c) => c.getBoundingClientRect().height / scale);
    const pages = paginate(units, heights);
    setLayout((prev) => (prev && prev.units === units && JSON.stringify(prev.pages) === JSON.stringify(pages) ? prev : { units, pages }));
  }, [units, fontsTick]);
  const pages = layout?.units === units ? layout.pages : null;

  // Zero-height, clipped wrapper: measurable, but adds no height (no extra printed pages).
  const measurer = (
    <div aria-hidden="true" className="pointer-events-none invisible absolute top-0 left-0 h-0 overflow-hidden">
      <div ref={box} style={{ width: CONTENT_W }}>
        {units.map((u) => (
          <div key={u.key} className={u.className}>
            {u.node}
          </div>
        ))}
      </div>
    </div>
  );
  return { pages, measurer };
}

function PageBody({ units, indexes }: { units: Unit[]; indexes: number[] }) {
  const focus = useContext(FocusContext);
  return (
    <>
      {indexes.map((idx, pos) => {
        const u = units[idx]!;
        return (
          <div
            key={u.key}
            data-sug={u.sug}
            className={cx(u.className, focus && u.sug === focus && "rounded-sm outline-2 outline-offset-2 outline-[#4f46e5]")}
            style={{ paddingTop: pos === 0 ? 0 : u.pad }}
          >
            {u.node}
          </div>
        );
      })}
    </>
  );
}

const Sheet = ({ children, print }: { children: ReactNode; print?: boolean }) => (
  <div
    className={cx("relative overflow-hidden bg-white", !print && "rounded-sm shadow-(--shadow-paper)")}
    style={{ width: print ? "210mm" : PAGE_W, height: print ? "297mm" : PAGE_H, padding: `${MARGIN_Y}px ${MARGIN_X}px`, boxSizing: "border-box" }}
  >
    {children}
  </div>
);

const docClass = "font-cv text-[10.5pt] leading-[1.45] text-[#1d1d24]";

// --- Public components -----------------------------------------------------------------

interface PreviewProps {
  data: ProfileData;
  language: Language;
  changes?: ChangeSet | null;
  focusSuggestion?: string | null;
}

/** Paged preview: separate A4 sheets, scaled to the container width. */
export function CvPreview({ data, language, changes = null, focusSuggestion = null }: PreviewProps) {
  const outer = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.6);
  const units = useMemo(() => buildUnits(data, language, changes), [data, language, changes]);
  const { pages, measurer } = usePages(units);
  const count = pages?.length ?? 1;

  useLayoutEffect(() => {
    const ro = new ResizeObserver(() => outer.current && setScale(Math.min(1, outer.current.clientWidth / PAGE_W)));
    if (outer.current) ro.observe(outer.current);
    return () => ro.disconnect();
  }, []);

  // Bring the focused change into view.
  useLayoutEffect(() => {
    if (!focusSuggestion) return;
    outer.current?.querySelector(`[data-sug="${focusSuggestion}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusSuggestion, pages]);

  const fullHeight = count * PAGE_H + (count - 1) * PAGE_GAP;

  return (
    <div ref={outer} className="w-full">
      <ChangesContext.Provider value={changes}>
        <FocusContext.Provider value={focusSuggestion}>
          <div style={{ height: fullHeight * scale }} className="relative">
            <div style={{ width: PAGE_W, transform: `scale(${scale})`, transformOrigin: "top left" }} className={cx("absolute top-0 left-0", docClass)}>
              <div style={TEXT_STYLE}>
                {measurer}
                {(pages ?? [units.map((_, i) => i)]).map((indexes, p) => (
                  <div key={p} style={{ marginTop: p === 0 ? 0 : PAGE_GAP }} className="relative">
                    {p > 0 && (
                      <span className="absolute -top-[22px] right-1 text-[11px] font-medium text-[#8a8aa0]">
                        Page {p + 1} of {count}
                      </span>
                    )}
                    <Sheet>
                      <PageBody units={units} indexes={indexes} />
                    </Sheet>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </FocusContext.Provider>
      </ChangesContext.Provider>
      <p className="mt-2 text-center text-xs text-muted">
        {count} {count === 1 ? "page" : "pages"} · A4 · page breaks match the PDF export
      </p>
    </div>
  );
}

/** Print layout for the PDF: same pagination, one sheet per printed page. */
export function CvPrint({ data, language, onReady }: { data: ProfileData; language: Language; onReady: () => void }) {
  const units = useMemo(() => buildUnits(data, language, null), [data, language]);
  const { pages, measurer } = usePages(units);
  useLayoutEffect(() => {
    if (pages) void document.fonts.ready.then(onReady);
  }, [pages, onReady]);
  return (
    <div className={docClass} style={TEXT_STYLE}>
      {measurer}
      {pages?.map((indexes, p) => (
        <div key={p} style={{ breakAfter: p < pages.length - 1 ? "page" : "auto" }}>
          <Sheet print>
            <PageBody units={units} indexes={indexes} />
          </Sheet>
        </div>
      ))}
    </div>
  );
}

/** First page only, for gallery cards. */
export function CvThumbnail({ data, language }: { data: ProfileData; language: Language }) {
  const outer = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);
  const units = useMemo(() => buildUnits(data, language, null), [data, language]);
  useLayoutEffect(() => {
    const ro = new ResizeObserver(() => outer.current && setScale(outer.current.clientWidth / PAGE_W));
    if (outer.current) ro.observe(outer.current);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={outer} className="relative aspect-[210/297] w-full overflow-hidden bg-white" aria-hidden="true">
      <div style={{ width: PAGE_W, transform: `scale(${scale})`, transformOrigin: "top left", ...TEXT_STYLE }} className={cx("pointer-events-none absolute top-0 left-0 select-none", docClass)}>
        <div style={{ padding: `${MARGIN_Y}px ${MARGIN_X}px` }}>
          <PageBody units={units} indexes={units.map((_, i) => i)} />
        </div>
      </div>
    </div>
  );
}
