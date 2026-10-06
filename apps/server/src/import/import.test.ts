import { describe, expect, it } from "vitest";
import { ProfileDataSchema } from "@rb/shared";
import { detectFileType, normalizeText } from "./extract.ts";
import { MappedCv, guessLanguage, toProfileData } from "./map-cv.ts";

describe("detectFileType", () => {
  const pdf = new TextEncoder().encode("%PDF-1.7");
  const zip = new Uint8Array([0x50, 0x4b, 3, 4]);
  it("detects PDFs by magic bytes regardless of name", () => expect(detectFileType("cv.docx", "", pdf)).toBe("pdf"));
  it("detects DOCX zips", () => expect(detectFileType("cv.docx", "", zip)).toBe("docx"));
  it("rejects other zips", () => expect(detectFileType("cv.zip", "application/zip", zip)).toBeNull());
});

describe("normalizeText", () => {
  it("collapses blank lines and trailing spaces", () => expect(normalizeText("a  \r\n\n\n\nb c")).toBe("a\n\nb c"));
});

describe("guessLanguage", () => {
  it("detects German", () => expect(guessLanguage("Berufserfahrung bei der Firma und Ausbildung")).toBe("de"));
  it("detects English", () => expect(guessLanguage("Experience at the company and education")).toBe("en"));
});

describe("toProfileData", () => {
  it("adds ids and default titles and produces a valid profile", () => {
    const mapped = MappedCv.parse({
      language: "en",
      basics: { fullName: "Jane Doe", headline: "", email: "", phone: "", location: "", links: [], summary: "" },
      sections: [
        { kind: "certifications", title: " ", items: [{ title: "PSPO I", subtitle: "Scrum.org", location: "", startDate: "2022", endDate: "", current: false, description: "", bullets: [], tags: [], url: "" }] },
        { kind: "custom", title: "Hobbies", items: [] },
      ],
    });
    const data = toProfileData(mapped, "de");
    expect(ProfileDataSchema.parse(data)).toEqual(data);
    expect(data.sections[0]!.title).toBe("Zertifikate");
    expect(data.sections[1]!.title).toBe("Hobbies");
    expect(data.sections[0]!.items[0]!.id).toMatch(/^[0-9a-f-]{36}$/);
  });
});
