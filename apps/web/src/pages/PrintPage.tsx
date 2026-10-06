import { useEffect, useState } from "react";
import { useParams } from "react-router";
import type { Language, ProfileData } from "@rb/shared";
import { CvDocument } from "../components/CvPreview";

/**
 * Bare CV page that headless Chromium prints to PDF. Signals readiness via
 * body[data-print-ready] (and data-print-error on failure).
 */
export function PrintPage() {
  const { kind = "", id = "" } = useParams();
  const [cv, setCv] = useState<{ data: ProfileData; language: Language } | null>(null);

  useEffect(() => {
    fetch(`/api/export/${kind}/${id}/data`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        setCv(body);
      })
      .catch((err: Error) => {
        document.body.dataset.printError = err.message;
        document.body.dataset.printReady = "1";
      });
  }, [kind, id]);

  useEffect(() => {
    if (!cv) return;
    document.title = `${cv.data.basics.fullName} – CV`;
    void document.fonts.ready.then(() => (document.body.dataset.printReady = "1"));
  }, [cv]);

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
