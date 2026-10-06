import { describe, expect, it } from "vitest";
import { emptyItem, newBlock, type ProfileData } from "@rb/shared";
import { checkExport, expectedElements } from "./check.ts";
import { renderDocx } from "./docx.ts";

const data: ProfileData = {
  basics: {
    fullName: "Ana Ćorić",
    headline: "Senior DevOps Engineer",
    email: "ana@example.com",
    phone: "+41 76 000 00 00",
    location: "Zürich",
    links: [{ label: "LinkedIn", url: "https://linkedin.com/in/ana" }],
    summary: "DevOps engineer with 8 years of experience in Kubernetes and Terraform.",
  },
  sections: [
    {
      id: "s1",
      kind: "experience",
      title: "Berufserfahrung",
      hidden: false,
      items: [
        {
          ...emptyItem(),
          title: "DevOps Engineer",
          subtitle: "Muster AG",
          startDate: "2021-03",
          current: true,
          content: [newBlock("text", "Platform team lead."), newBlock("bullet", "Cut deploy time by 40% with GitLab CI.")],
          tags: ["Kubernetes", "Terraform"],
        },
        { ...emptyItem(), title: "Old job", subtitle: "Hidden GmbH", hidden: true },
      ],
    },
    { id: "s2", kind: "languages", title: "Sprachen", hidden: false, items: [{ ...emptyItem(), title: "Deutsch", subtitle: "Muttersprache" }] },
  ],
};

describe("export ATS check", () => {
  it("lists visible content only, with localized dates", () => {
    const { elements, headings } = expectedElements(data, "de");
    const texts = elements.map((e) => e.text);
    expect(texts).toContain("März 2021 – heute");
    expect(texts).not.toContain("Old job");
    expect(headings).toEqual(["Profil", "Berufserfahrung", "Sprachen"]);
  });

  it("DOCX round-trips every element in order", async () => {
    const bytes = await renderDocx(data, "de");
    const report = await checkExport("docx", bytes, data, "de");
    expect(report.missing).toEqual([]);
    expect(report.orderOk).toBe(true);
    expect(report.text).toContain("Ana Ćorić");
    expect(report.text).not.toContain("Hidden GmbH");
  });

  it("reports what's missing", async () => {
    const bytes = await renderDocx({ ...data, basics: { ...data.basics, email: "" } }, "de");
    const report = await checkExport("docx", bytes, data, "de");
    expect(report.ok).toBe(false);
    expect(report.missing.map((m) => m.label)).toEqual(["Email"]);
  });
});
