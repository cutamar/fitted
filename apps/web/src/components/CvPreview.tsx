import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { CV_LABELS, formatCvDateRange, type Block, type Item, type Language, type ProfileData, type Section } from "@rb/shared";

/** A4 at 96 dpi. */
const PAGE_W = 794;
const PAGE_H = 1123;

/**
 * Renders the CV on a white A4 sheet scaled to the container width.
 * Single-column, plain-text layout: what ATS parsers read most reliably.
 */
export function CvPreview({ data, language }: { data: ProfileData; language: Language }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.6);
  const [height, setHeight] = useState(PAGE_H);

  useLayoutEffect(() => {
    const ro = new ResizeObserver(() => {
      if (outer.current) setScale(Math.min(1, outer.current.clientWidth / PAGE_W));
      if (inner.current) setHeight(Math.max(PAGE_H, inner.current.scrollHeight));
    });
    if (outer.current) ro.observe(outer.current);
    if (inner.current) ro.observe(inner.current);
    return () => ro.disconnect();
  }, []);

  const pages = Math.ceil(height / PAGE_H);

  return (
    <div ref={outer} className="w-full">
      <div style={{ height: pages * PAGE_H * scale }} className="relative">
        <div
          ref={inner}
          style={{ width: PAGE_W, minHeight: pages * PAGE_H, transform: `scale(${scale})`, transformOrigin: "top left" }}
          className="absolute top-0 left-0 rounded-sm bg-white text-[#1d1d24] shadow-(--shadow-paper)"
        >
          <CvDocument data={data} language={language} />
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

export function CvDocument({ data, language }: { data: ProfileData; language: Language }) {
  const { basics } = data;
  const contact = [basics.location, basics.phone, basics.email, ...basics.links.map((l) => l.url)].filter(Boolean);
  const sections = data.sections.filter((s) => !s.hidden && s.items.some((i) => !i.hidden));

  return (
    <div className="px-[56px] py-[48px] font-sans text-[10.5pt] leading-[1.45]">
      <header>
        <h1 className="text-[22pt] leading-tight font-bold tracking-tight">{basics.fullName || "Your Name"}</h1>
        {basics.headline && <div className="mt-0.5 text-[12pt] font-medium text-[#4f46e5]">{basics.headline}</div>}
        {contact.length > 0 && <div className="mt-1.5 text-[9.5pt] text-[#55556a]">{contact.join("  ·  ")}</div>}
      </header>

      {basics.summary && (
        <CvSection title={CV_LABELS[language].summary}>
          <p className="whitespace-pre-line">{basics.summary}</p>
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

function SectionBody({ section, language }: { section: Section; language: Language }) {
  const items = section.items.filter((i) => !i.hidden);

  if (section.kind === "skills") {
    return (
      <div className="flex flex-col gap-0.5">
        {items.map((i) => (
          <p key={i.id}>
            {i.title && <span className="font-semibold">{i.title}: </span>}
            {i.tags.join(", ")}
          </p>
        ))}
      </div>
    );
  }

  if (section.kind === "languages") {
    return <p>{items.map((i) => (i.subtitle ? `${i.title} (${i.subtitle})` : i.title)).join("  ·  ")}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((i) => (
        <CvEntry key={i.id} item={i} language={language} showTags={section.kind !== "custom"} />
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
          {item.tags.join(", ")}
        </p>
      )}
    </div>
  );
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
                {b.text}
              </li>
            ))}
          </ul>
        ) : (
          <p key={g.id} className="whitespace-pre-line">
            {g.text}
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
