import { useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Button, Card, Notice, Spinner, cx } from "../components/ui";
import { loginUrl, useAuthStatus, useUploadCv } from "../lib/api";

export function ImportPage() {
  const upload = useUploadCv();
  const auth = useAuthStatus();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const aiReady = auth.data?.connected === true && auth.data.sharing;

  const handle = async (file: File | undefined) => {
    if (!file) return;
    const rec = await upload.mutateAsync(file);
    navigate(`/imports/${rec.id}`);
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Import CV</h1>
        <p className="mt-1 text-sm text-muted">
          Upload a PDF or DOCX. Its text is mapped into sections, and you review and correct everything before saving it as a profile.
        </p>
      </div>

      {auth.data && !aiReady && (
        <Notice>
          Without ChatGPT the text is extracted but not mapped, so you fill in the sections yourself.{" "}
          <a href={loginUrl()} className="font-medium underline">
            Sign in with ChatGPT
          </a>{" "}
          to map it automatically.
        </Notice>
      )}

      <Card
        className={cx("flex flex-col items-center gap-3 border-2 border-dashed p-12 text-center transition", dragging && "border-accent bg-subtle")}
      >
        <div
          className="contents"
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
        >
          {upload.isPending ? (
            <>
              <Spinner className="size-6 text-accent" />
              <p className="text-sm font-medium">Reading your CV{aiReady ? " and mapping sections" : ""}…</p>
              {aiReady && <p className="text-xs text-muted">This usually takes 20–60 seconds.</p>}
            </>
          ) : (
            <>
              <p className="text-sm">Drop your CV here</p>
              <p className="text-xs text-muted">PDF or DOCX, up to 10 MB</p>
              <Button variant="primary" onClick={() => inputRef.current?.click()}>
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
      </Card>

      {upload.error && <Notice tone="error">{(upload.error as Error).message}</Notice>}
    </div>
  );
}
