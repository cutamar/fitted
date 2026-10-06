import { useEffect, useState } from "react";
import { useParams } from "react-router";
import type { Language, ProfileData } from "@rb/shared";
import { CvDocument } from "../components/CvPreview";
import { LetterDocument, type LetterData } from "../components/LetterDocument";

/**
 * Bare CV page that headless Chromium prints to PDF. Signals readiness via
 * body[data-print-ready] (and data-print-error on failure).
 */
export function PrintPage() {
  const { kind = "", id = "" } = useParams();
  const [cv, setCv] = useState<{ data: ProfileData; language: Language } | null>(null);
  const [letter, setLetter] = useState<LetterData | null>(null);
  const isLetter = kind === "letter";

  useEffect(() => {
    fetch(isLetter ? `/api/export/letter/${id}/data${location.search}` : `/api/export/${kind}/${id}/data`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        if (isLetter) setLetter(body);
        else setCv(body);
      })
      .catch((err: Error) => {
        document.body.dataset.printError = err.message;
        document.body.dataset.printReady = "1";
      });
  }, [kind, id, isLetter]);

  useEffect(() => {
    if (!cv && !letter) return;
    document.title = cv ? `${cv.data.basics.fullName} – CV` : `${letter!.basics.fullName} – Cover letter`;
    void document.fonts.ready.then(() => (document.body.dataset.printReady = "1"));
  }, [cv, letter]);

  if (letter) {
    return (
      <>
        <style>{`@page { size: A4; margin: 20mm 22mm; } html, body { background: #fff !important; }`}</style>
        <LetterDocument letter={letter} />
      </>
    );
  }
  if (!cv) return null;
  return (
    <>
      <style>{`@page { size: A4; margin: 13mm 15mm; } html, body { background: #fff !important; }`}</style>
      <div className="text-[#1d1d24]">
        <CvDocument data={cv.data} language={cv.language} print />
      </div>
    </>
  );
}
