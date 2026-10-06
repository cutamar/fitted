import { useRef, useState } from "react";
import { FileUp } from "lucide-react";
import { useNavigate } from "react-router";
import { Button, Notice, PageHeader, Spinner, cx } from "../components/ui";
import { loginUrl, useAuthStatus, useUploadCv } from "../lib/api";

export function ImportPage() {
  const upload = useUploadCv();
  const auth = useAuthStatus();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const aiReady = auth.data?.connected === true && auth.data.sharing;

  const handle = async (file: File | undefined) => {
    if (!file || upload.isPending) return;
    const rec = await upload.mutateAsync(file);
    navigate(`/imports/${rec.id}`);
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <PageHeader
        title="Import CV"
        description="Upload a PDF or Word file. It's split into sections, and you review and correct everything before it becomes a profile."
      />

      {auth.data && !aiReady && (
        <Notice>
          Without ChatGPT, the text is extracted but not sorted into sections, so you'd fill them in yourself.{" "}
          <a href={loginUrl()} className="font-medium underline">
            Sign in with ChatGPT
          </a>{" "}
          to do it automatically.
        </Notice>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handle(e.dataTransfer.files[0]);
        }}
        className={cx(
          "flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed bg-surface px-6 py-16 text-center transition",
          dragging ? "border-accent bg-accent-soft" : "border-border",
        )}
      >
        {upload.isPending ? (
          <>
            <Spinner className="size-7 text-accent" />
            <p className="font-medium">Reading your CV{aiReady ? " and sorting it into sections" : ""}…</p>
            {aiReady && <p className="text-sm text-muted">Usually takes 20–60 seconds.</p>}
          </>
        ) : (
          <>
            <div className="flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent-soft-fg">
              <FileUp className="size-5" />
            </div>
            <p className="font-medium">Drag your CV here</p>
            <p className="text-sm text-muted">PDF or DOCX, up to 10 MB</p>
            <Button variant="primary" className="mt-2" onClick={() => inputRef.current?.click()}>
              Choose file
            </Button>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(e) => handle(e.target.files?.[0])}
            />
          </>
        )}
      </div>

      {upload.error && <Notice tone="error">{(upload.error as Error).message}</Notice>}
    </div>
  );
}
