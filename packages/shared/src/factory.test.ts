import { describe, expect, it } from "vitest";
import { cloneProfileData, emptyItem, emptyProfileData } from "./factory.ts";
import { ProfileDataSchema } from "./profile.ts";

describe("profile factories", () => {
  it("empty profile is valid and localized", () => {
    const data = emptyProfileData("de");
    expect(ProfileDataSchema.parse(data)).toEqual(data);
    expect(data.sections.map((s) => s.title)).toEqual(["Berufserfahrung", "Ausbildung", "Kenntnisse", "Sprachen"]);
  });

  it("clone gives fresh ids and does not share references", () => {
    const data = emptyProfileData("en");
    data.sections[0]!.items.push({ ...emptyItem(), title: "PO", bullets: ["x"] });
    const copy = cloneProfileData(data);
    expect(copy.sections[0]!.id).not.toBe(data.sections[0]!.id);
    expect(copy.sections[0]!.items[0]!.id).not.toBe(data.sections[0]!.items[0]!.id);
    copy.sections[0]!.items[0]!.bullets.push("y");
    expect(data.sections[0]!.items[0]!.bullets).toEqual(["x"]);
  });

  it("schema fills defaults for missing fields", () => {
    const parsed = ProfileDataSchema.parse({ sections: [{ id: "s", kind: "skills", title: "Skills", items: [{ id: "i", tags: ["SQL"] }] }] });
    expect(parsed.basics.fullName).toBe("");
    expect(parsed.sections[0]!.items[0]!.bullets).toEqual([]);
  });
});
