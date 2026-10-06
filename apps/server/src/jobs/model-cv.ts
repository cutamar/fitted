import type { ProfileData } from "@rb/shared";

/**
 * Renders a profile as compact text with short ids ([i3], [b12]) for the model,
 * so it can point at entries and blocks without echoing UUIDs.
 */
export function cvForModel(data: ProfileData): {
  text: string;
  resolve: (shortId: string) => string | null;
  shortIdOf: (realId: string) => string;
} {
  const ids = new Map<string, string>();
  let itemN = 0;
  let blockN = 0;
  const lines: string[] = [];

  lines.push(`NAME: ${data.basics.fullName}`);
  lines.push(`HEADLINE: ${data.basics.headline || "(none)"}`);
  lines.push(`SUMMARY: ${data.basics.summary || "(none)"}`);

  for (const section of data.sections) {
    lines.push("", `## ${section.title} (kind: ${section.kind}${section.hidden ? ", hidden section" : ""})`);
    section.items.forEach((item, idx) => {
      const iid = `i${++itemN}`;
      ids.set(iid, item.id);
      const dates = [item.startDate, item.current ? "present" : item.endDate].filter(Boolean).join(" – ");
      const head = [item.title, item.subtitle, item.location, dates].filter(Boolean).join(" | ");
      lines.push(`[${iid}] (position ${idx}${item.hidden ? ", HIDDEN" : ""}) ${head}`);
      for (const block of item.content) {
        const bid = `b${++blockN}`;
        ids.set(bid, block.id);
        lines.push(`  [${bid}] (${block.type === "bullet" ? "bullet" : "paragraph"}) ${block.text}`);
      }
      if (item.tags.length) lines.push(`  tags: ${item.tags.join(", ")}`);
    });
  }

  const reverse = new Map([...ids].map(([short, real]) => [real, short]));
  return {
    text: lines.join("\n"),
    resolve: (shortId) => ids.get(shortId.trim().replace(/^\[|\]$/g, "")) ?? null,
    shortIdOf: (realId) => reverse.get(realId) ?? "",
  };
}
