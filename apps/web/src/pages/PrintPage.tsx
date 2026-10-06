import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router";
import type { Language, ProfileData } from "@rb/shared";
import { CvPrint } from "../components/CvPreview";
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

  const markReady = useCallback(() => {
    document.body.dataset.printReady = "1";
  }, []);

  useEffect(() => {
    if (!cv && !letter) return;
    document.title = cv ? `${cv.data.basics.fullName} – CV` : `${letter!.basics.fullName} – Cover letter`;
    // The CV signals readiness itself once paginated; the letter only needs fonts.
    if (letter) void document.fonts.ready.then(markReady);
  }, [cv, letter, markReady]);

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
      {/* Pages are explicit A4 sheets with their own margins (see CvPrint). */}
      <style>{`@page { size: A4; margin: 0; } html, body { background: #fff !important; margin: 0; }`}</style>
      <CvPrint data={cv.data} language={cv.language} onReady={markReady} />
    </>
  );
}
