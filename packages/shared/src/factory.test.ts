import { describe, expect, it } from "vitest";
import { cloneProfileData, emptyItem, emptyProfileData, newBlock } from "./factory.ts";
import { formatCvDateRange } from "./i18n.ts";
import { ProfileDataSchema } from "./profile.ts";

describe("profile factories", () => {
  it("empty profile is valid and localized", () => {
    const data = emptyProfileData("de");
    expect(ProfileDataSchema.parse(data)).toEqual(data);
    expect(data.sections.map((s) => s.title)).toEqual(["Berufserfahrung", "Ausbildung", "Kenntnisse", "Sprachen"]);
  });

  it("clone gives fresh ids and does not share references", () => {
    const data = emptyProfileData("en");
    data.sections[0]!.items.push({ ...emptyItem(), title: "PO", content: [newBlock("bullet", "x")] });
    const copy = cloneProfileData(data);
    expect(copy.sections[0]!.id).not.toBe(data.sections[0]!.id);
    expect(copy.sections[0]!.items[0]!.id).not.toBe(data.sections[0]!.items[0]!.id);
    expect(copy.sections[0]!.items[0]!.content[0]!.id).not.toBe(data.sections[0]!.items[0]!.content[0]!.id);
    copy.sections[0]!.items[0]!.content[0]!.text = "y";
    expect(data.sections[0]!.items[0]!.content[0]!.text).toBe("x");
  });

  it("schema fills defaults for missing fields", () => {
    const parsed = ProfileDataSchema.parse({ sections: [{ id: "s", kind: "skills", title: "Skills", items: [{ id: "i", tags: ["SQL"] }] }] });
    expect(parsed.basics.fullName).toBe("");
    expect(parsed.sections[0]!.items[0]!.content).toEqual([]);
  });

  it("upgrades legacy description + bullets into ordered blocks", () => {
    const parsed = ProfileDataSchema.parse({
      sections: [{ id: "s", kind: "experience", title: "Work", items: [{ id: "i", description: "Led team.", bullets: ["Cut cost 20%", "Shipped X"] }] }],
    });
    expect(parsed.sections[0]!.items[0]!.content.map((b) => [b.type, b.text])).toEqual([
      ["text", "Led team."],
      ["bullet", "Cut cost 20%"],
      ["bullet", "Shipped X"],
    ]);
  });
});

describe("formatCvDateRange", () => {
  it("formats per language", () => {
    expect(formatCvDateRange("2021-04", "", true, "en")).toBe("Apr 2021 – Present");
    expect(formatCvDateRange("2021-03", "2024", false, "de")).toBe("März 2021 – 2024");
    expect(formatCvDateRange("", "", false, "en")).toBe("");
  });
});
