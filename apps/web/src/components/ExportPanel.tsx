import { useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, FileDown, ScanSearch } from "lucide-react";
import { exportUrl, useAtsCheck, type AtsReport, type ExportKind } from "../lib/api";
import { Button, Card, Notice, Spinner, cx } from "./ui";

interface Props {
  kind: ExportKind;
  id: string;
  /** Shown instead of allowing export, e.g. unsaved changes. */
  blockedReason?: string | null;
  /** Bump to invalidate a previous check when the CV changes. */
  version: string;
}

export function ExportPanel({ kind, id, blockedReason, version }: Props) {
  const check = useAtsCheck(kind, id);
  const [checkedVersion, setCheckedVersion] = useState<string | null>(null);
  const reports = checkedVersion === version ? check.data : undefined;
  const [downloading, setDownloading] = useState<"pdf" | "docx" | null>(null);

  const download = async (format: "pdf" | "docx") => {
    // Fetch instead of a plain link so errors (e.g. missing Chromium) are visible.
    setDownloading(format);
    try {
      const res = await fetch(exportUrl(kind, id, format));
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `Export failed (${res.status})`);
      const name = res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ?? `CV.${format}`;
      const url = URL.createObjectURL(await res.blob());
      const a = Object.assign(document.createElement("a"), { href: url, download: name });
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setDownloading(null);
    }
  };

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <div className="font-semibold">Export</div>
          <div className="text-xs text-muted">ATS-friendly single-column layout, real text, standard headings.</div>
        </div>
        <Button variant="primary" disabled={!!blockedReason || !!downloading} onClick={() => download("pdf")}>
          {downloading === "pdf" ? <Spinner className="size-3.5" /> : <FileDown />} PDF
        </Button>
        <Button disabled={!!blockedReason || !!downloading} onClick={() => download("docx")}>
          {downloading === "docx" ? <Spinner className="size-3.5" /> : <FileDown />} Word
        </Button>
      </div>
      {blockedReason && (
        <div className="mt-3">
          <Notice>{blockedReason}</Notice>
        </div>
      )}

      <div className="mt-4 border-t border-border pt-4">
        <div className="flex items-center gap-2">
          <div className="mr-auto text-sm">
            <span className="font-medium">ATS readability check</span>
            <span className="block text-xs text-muted">Re-reads both files like an ATS parser and checks every heading, job, date, bullet and skill made it.</span>
          </div>
          <Button
            size="sm"
            variant="soft"
            disabled={!!blockedReason || check.isPending}
            onClick={() => check.mutate(undefined, { onSuccess: () => setCheckedVersion(version) })}
          >
            {check.isPending ? <Spinner className="size-3" /> : <ScanSearch />} {reports ? "Check again" : "Run check"}
          </Button>
        </div>
        {check.error && (
          <div className="mt-3">
            <Notice tone="error">{(check.error as Error).message}</Notice>
          </div>
        )}
        {reports && (
          <div className="mt-3 flex flex-col gap-2">
            {reports.map((r) => (
              <ReportRow key={r.format} report={r} />
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function ReportRow({ report: r }: { report: AtsReport }) {
  const [open, setOpen] = useState(false);
  const [showText, setShowText] = useState(false);
  return (
    <div className={cx("rounded-lg border", r.ok ? "border-success/30" : "border-warn-fg/30")}>
      <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm" onClick={() => setOpen((o) => !o)}>
        {r.ok ? <CheckCircle2 className="size-4 text-success" /> : <AlertTriangle className="size-4 text-warn-fg" />}
        <span className="font-medium uppercase">{r.format}</span>
        <span className="text-muted">
          {r.found}/{r.total} elements readable{r.pages !== null && ` · ${r.pages} ${r.pages === 1 ? "page" : "pages"}`}
          {!r.orderOk && " · section order differs"}
        </span>
        <span className="ml-auto text-muted">{open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</span>
      </button>
      {open && (
        <div className="border-t border-border px-3 py-2 text-xs">
          {r.missing.length > 0 ? (
            <>
              <div className="mb-1 font-medium">Not found in the extracted text:</div>
              <ul className="mb-2 list-disc pl-4 text-muted">
                {r.missing.map((m, i) => (
                  <li key={i}>
                    <span className="text-fg">{m.label}</span>: “{m.text}”
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mb-2 text-muted">Everything was extracted correctly{r.orderOk ? ", in the right order" : ""}.</p>
          )}
          <button type="button" className="font-medium text-accent" onClick={() => setShowText((s) => !s)}>
            {showText ? "Hide" : "Show"} what an ATS sees
          </button>
          {showText && <pre className="mt-2 max-h-80 overflow-auto rounded-md bg-subtle p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">{r.text}</pre>}
        </div>
      )}
    </div>
  );
}
