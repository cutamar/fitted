/**
 * DOCX export built natively: real Word heading styles and list numbering,
 * single column, no tables/text boxes/headers — the structure ATS parse best.
 */
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  Tab,
  TabStopType,
  TextRun,
} from "docx";
import { BRAND, CV_LABELS, formatCvDateRange, type Block, type Item, type Language, type ProfileData, type Section } from "@rb/shared";

const FONT = "Calibri";
const ACCENT = "4F46E5";
const MUTED = "55556A";
/** A4 in twips, ~16 mm side margins. */
const PAGE = { width: 11906, height: 16838, marginX: 900, marginY: 850 };
const CONTENT_WIDTH = PAGE.width - 2 * PAGE.marginX;

const pt = (n: number) => Math.round(n * 2); // docx sizes are half-points

function entryHeader(item: Item, language: Language): Paragraph[] {
  const dates = formatCvDateRange(item.startDate, item.endDate, item.current, language);
  const out = [
    new Paragraph({
      keepNext: true,
      spacing: { before: 120 },
      tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_WIDTH }],
      // A real <w:tab/> jumps to the right-aligned tab stop; a "\t" inside the text is ignored by Word.
      children: [new TextRun({ text: item.title, bold: true }), ...(dates ? [new TextRun({ children: [new Tab(), dates], color: MUTED, size: pt(9.5) })] : [])],
    }),
  ];
  const sub = [item.subtitle, item.location].filter(Boolean).join(" | ");
  if (sub) out.push(new Paragraph({ keepNext: true, children: [new TextRun({ text: sub, italics: true })] }));
  if (item.url) out.push(new Paragraph({ children: [new TextRun({ text: item.url, color: MUTED, size: pt(9.5) })] }));
  return out;
}

function blocks(content: Block[]): Paragraph[] {
  return content
    .filter((b) => b.text.trim())
    .map((b) =>
      b.type === "bullet"
        ? new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 20 }, children: [new TextRun(b.text)] })
        : new Paragraph({ spacing: { before: 40, after: 40 }, children: [new TextRun(b.text)] }),
    );
}

function sectionBody(section: Section, language: Language): Paragraph[] {
  const items = section.items.filter((i) => !i.hidden);
  if (section.kind === "skills") {
    return items.map(
      (i) => new Paragraph({ children: [...(i.title ? [new TextRun({ text: `${i.title}: `, bold: true })] : []), new TextRun(i.tags.join(", "))] }),
    );
  }
  if (section.kind === "languages") {
    return [new Paragraph({ children: [new TextRun(items.map((i) => (i.subtitle ? `${i.title} (${i.subtitle})` : i.title)).join("  ·  "))] })];
  }
  return items.flatMap((i) => [
    ...entryHeader(i, language),
    ...blocks(i.content),
    ...(section.kind !== "custom" && i.tags.length
      ? [
          new Paragraph({
            spacing: { before: 40 },
            children: [new TextRun({ text: `${CV_LABELS[language].tags}: `, bold: true, size: pt(9.5) }), new TextRun({ text: i.tags.join(", "), size: pt(9.5) })],
          }),
        ]
      : []),
  ]);
}

export async function renderDocx(data: ProfileData, language: Language): Promise<Uint8Array> {
  const { basics } = data;
  const contact = [basics.location, basics.phone, basics.email, ...basics.links.map((l) => l.url)].filter(Boolean).join("  ·  ");
  const sections = data.sections.filter((s) => !s.hidden && s.items.some((i) => !i.hidden));

  const children: Paragraph[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(basics.fullName || "Your Name")] }),
  ];
  if (basics.headline) children.push(new Paragraph({ children: [new TextRun({ text: basics.headline, color: ACCENT, size: pt(12) })] }));
  if (contact) children.push(new Paragraph({ spacing: { before: 60 }, children: [new TextRun({ text: contact, color: MUTED, size: pt(9.5) })] }));
  if (basics.summary) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(CV_LABELS[language].summary)] }));
    for (const para of basics.summary.split(/\n+/).filter(Boolean)) children.push(new Paragraph({ children: [new TextRun(para)] }));
  }
  for (const s of sections) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(s.title)] }));
    children.push(...sectionBody(s, language));
  }

  const doc = new Document({
    creator: basics.fullName || BRAND.name,
    title: `${basics.fullName} – CV`,
    description: `Created with ${BRAND.name}`,
    styles: {
      default: { document: { run: { font: FONT, size: pt(10.5), color: "1D1D24" }, paragraph: { spacing: { line: 264 } } } },
      paragraphStyles: [
        {
          id: "Title",
          name: "Title",
          basedOn: "Normal",
          next: "Normal",
          run: { font: FONT, size: pt(22), bold: true, color: "1D1D24" },
          paragraph: { spacing: { after: 20 } },
        },
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font: FONT, size: pt(10.5), bold: true, allCaps: true, characterSpacing: 16, color: "1D1D24" },
          paragraph: {
            keepNext: true,
            spacing: { before: 280, after: 100 },
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "D8D8E2", space: 2 } },
          },
        },
      ],
    },
    numbering: {
      config: [
        {
          reference: "bullets",
          levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 240 } } } }],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE.width, height: PAGE.height },
            margin: { top: PAGE.marginY, bottom: PAGE.marginY, left: PAGE.marginX, right: PAGE.marginX },
          },
        },
        children,
      },
    ],
  });
  return new Uint8Array(await Packer.toBuffer(doc));
}
