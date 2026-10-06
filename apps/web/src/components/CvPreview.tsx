import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { CV_LABELS, formatCvDateRange, type Block, type ChangeSet, type Item, type Language, type ProfileData, type Section } from "@rb/shared";
import { cx } from "./ui";
import { TagsDiff, WordDiff } from "./WordDiff";

/** A4 at 96 dpi. */
const PAGE_W = 794;
const PAGE_H = 1123;

/** When set, the document highlights what changed relative to the base profile. */
const ChangesContext = createContext<ChangeSet | null>(null);

const ADDED = "bg-[#d9f5e6]";
const REMOVED = "bg-[#fde3df] text-[#9c2a14] line-through";

/**
 * Renders the CV on a white A4 sheet scaled to the container width.
 * Single-column, plain-text layout: what ATS parsers read most reliably.
 */
export function CvPreview({ data, language, changes = null }: { data: ProfileData; language: Language; changes?: ChangeSet | null }) {
  const outer = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.6);
  const [height, setHeight] = useState(PAGE_H);

  useLayoutEffect(() => {
    const ro = new ResizeObserver(() => {
      if (outer.current) setScale(Math.min(1, outer.current.clientWidth / PAGE_W));
      if (content.current) setHeight(content.current.offsetHeight);
    });
    if (outer.current) ro.observe(outer.current);
    if (content.current) ro.observe(content.current);
    return () => ro.disconnect();
  }, []);

  const pages = Math.max(1, Math.ceil(height / PAGE_H));

  return (
    <div ref={outer} className="w-full">
      <div style={{ height: pages * PAGE_H * scale }} className="relative">
        <div
          style={{ width: PAGE_W, height: pages * PAGE_H, transform: `scale(${scale})`, transformOrigin: "top left" }}
          className="absolute top-0 left-0 rounded-sm bg-white text-[#1d1d24] shadow-(--shadow-paper)"
        >
          <div ref={content}>
            <ChangesContext.Provider value={changes}>
              <CvDocument data={data} language={language} />
            </ChangesContext.Provider>
          </div>
          {Array.from({ length: pages - 1 }, (_, i) => (
            <div
              key={i}
              style={{ top: (i + 1) * PAGE_H }}
              className="pointer-events-none absolute inset-x-0 border-t border-dashed border-[#c9c9d6]"
              title={`Page ${i + 2}`}
            />
          ))}
        </div>
      </div>
      <p className="mt-2 text-center text-xs text-muted">
        {pages} {pages === 1 ? "page" : "pages"} · A4
      </p>
    </div>
  );
}

/**
 * The CV itself. `print` drops the sheet padding because @page margins apply
 * on every printed page. Ligatures are off so extracted text stays plain ("fi", not "ﬁ").
 */
export function CvDocument({ data, language, print = false }: { data: ProfileData; language: Language; print?: boolean }) {
  const changes = useContext(ChangesContext);
  const { basics } = data;
  const contact = [basics.location, basics.phone, basics.email, ...basics.links.map((l) => l.url)].filter(Boolean);
  const sections = data.sections.filter((s) => !s.hidden && s.items.some((i) => !i.hidden));
  const headline = changes?.headline !== undefined ? <WordDiff paper before={changes.headline} after={basics.headline} /> : basics.headline;
  const summary = changes?.summary !== undefined ? <WordDiff paper before={changes.summary} after={basics.summary} /> : basics.summary;

  return (
    <div
      className={cx("font-cv text-[10.5pt] leading-[1.45]", !print && "px-[56px] py-[48px]")}
      style={{ fontVariantLigatures: "none", fontFeatureSettings: '"liga" 0, "calt" 0' }}
    >
      <header>
        <h1 className="text-[22pt] leading-tight font-bold tracking-tight">{basics.fullName || "Your Name"}</h1>
        {(basics.headline || changes?.headline) && <div className="mt-0.5 text-[12pt] font-medium text-[#4f46e5]">{headline}</div>}
        {contact.length > 0 && <div className="mt-1.5 text-[9.5pt] text-[#55556a]">{contact.join("  ·  ")}</div>}
      </header>

      {(basics.summary || changes?.summary) && (
        <CvSection title={CV_LABELS[language].summary}>
          <p className="whitespace-pre-line">{summary}</p>
        </CvSection>
      )}

      {sections.map((s) => (
        <CvSection key={s.id} title={s.title}>
          <SectionBody section={s} language={language} />
        </CvSection>
      ))}
    </div>
  );
}

function CvSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-5">
      <h2 className="border-b border-[#d8d8e2] pb-1 text-[10pt] font-bold tracking-[0.08em] text-[#1d1d24] uppercase">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function Tags({ item }: { item: Item }) {
  const changes = useContext(ChangesContext);
  const before = changes?.tags[item.id];
  return before ? <TagsDiff paper before={before} after={item.tags} /> : <>{item.tags.join(", ")}</>;
}

/** Wraps an entry with a marker when it was hidden, re-shown or moved. */
function ItemMark({ item, children }: { item: Item; children: ReactNode }) {
  const changes = useContext(ChangesContext);
  const mark = changes?.items[item.id];
  if (!mark) return <>{children}</>;
  return (
    <div
      className={
        mark === "hidden"
          ? "relative opacity-55 [&_*]:line-through [&_*]:decoration-[#c4320a]"
          : mark === "shown"
            ? `relative ${ADDED} -mx-1 rounded-sm px-1`
            : "relative -ml-3 border-l-2 border-[#4f46e5] pl-2.5"
      }
      title={mark === "hidden" ? "Will be hidden" : mark === "shown" ? "Will be shown" : "Moved"}
    >
      {children}
    </div>
  );
}

function SectionBody({ section, language }: { section: Section; language: Language }) {
  const items = section.items.filter((i) => !i.hidden);

  if (section.kind === "skills") {
    return (
      <div className="flex flex-col gap-0.5">
        {items.map((i) => (
          <ItemMark key={i.id} item={i}>
            <p>
              {i.title && <span className="font-semibold">{i.title}: </span>}
              <Tags item={i} />
            </p>
          </ItemMark>
        ))}
      </div>
    );
  }

  if (section.kind === "languages") {
    return (
      <p>
        {items.map((i, idx) => (
          <span key={i.id}>
            {idx > 0 && "  ·  "}
            <ItemMark item={i}>
              <span className="inline">{i.subtitle ? `${i.title} (${i.subtitle})` : i.title}</span>
            </ItemMark>
          </span>
        ))}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((i) => (
        <ItemMark key={i.id} item={i}>
          <CvEntry item={i} language={language} showTags={section.kind !== "custom"} />
        </ItemMark>
      ))}
    </div>
  );
}

function CvEntry({ item, language, showTags }: { item: Item; language: Language; showTags: boolean }) {
  const dates = formatCvDateRange(item.startDate, item.endDate, item.current, language);
  const sub = [item.subtitle, item.location].filter(Boolean).join(" | ");
  return (
    <div className="break-inside-avoid">
      <div className="flex items-baseline justify-between gap-4">
        <div className="font-semibold">{item.title}</div>
        {dates && <div className="shrink-0 text-[9.5pt] text-[#55556a]">{dates}</div>}
      </div>
      {sub && <div className="text-[#3a3a4a] italic">{sub}</div>}
      {item.url && <div className="text-[9.5pt] text-[#55556a]">{item.url}</div>}
      <BlockList blocks={item.content} />
      {showTags && item.tags.length > 0 && (
        <p className="mt-1 text-[9.5pt] text-[#3a3a4a]">
          <span className="font-semibold">{CV_LABELS[language].tags}: </span>
          <Tags item={item} />
        </p>
      )}
    </div>
  );
}

function BlockText({ block }: { block: Block }) {
  const change = useContext(ChangesContext)?.blocks[block.id];
  if (!change) return <>{block.text}</>;
  if (change.kind === "changed") return <WordDiff paper before={change.before} after={block.text} />;
  return <span className={change.kind === "added" ? ADDED : REMOVED}>{block.text}</span>;
}

/** Paragraphs as <p>, runs of consecutive bullets as one <ul>. */
function BlockList({ blocks }: { blocks: Block[] }) {
  const groups: (Block | Block[])[] = [];
  for (const b of blocks) {
    if (!b.text.trim()) continue;
    const last = groups.at(-1);
    if (b.type === "bullet") Array.isArray(last) ? last.push(b) : groups.push([b]);
    else groups.push(b);
  }
  if (!groups.length) return null;
  return (
    <div className="mt-1 flex flex-col gap-1">
      {groups.map((g) =>
        Array.isArray(g) ? (
          <ul key={g[0]!.id} className="ml-4 list-disc space-y-0.5 marker:text-[#7a7a90]">
            {g.map((b) => (
              <li key={b.id} className="pl-0.5">
                <BlockText block={b} />
              </li>
            ))}
          </ul>
        ) : (
          <p key={g.id} className="whitespace-pre-line">
            <BlockText block={g} />
          </p>
        ),
      )}
    </div>
  );
}

/** First page only, cropped, for gallery cards. */
export function CvThumbnail({ data, language }: { data: ProfileData; language: Language }) {
  const outer = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);
  useLayoutEffect(() => {
    const ro = new ResizeObserver(() => outer.current && setScale(outer.current.clientWidth / PAGE_W));
    if (outer.current) ro.observe(outer.current);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={outer} className="relative aspect-[210/297] w-full overflow-hidden bg-white" aria-hidden="true">
      <div style={{ width: PAGE_W, transform: `scale(${scale})`, transformOrigin: "top left" }} className="pointer-events-none absolute top-0 left-0 text-[#1d1d24] select-none">
        <CvDocument data={data} language={language} />
      </div>
    </div>
  );
}
