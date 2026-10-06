import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { LANGUAGES, LANGUAGE_NAMES, type Language, type ProfileData } from "@rb/shared";
import { CvPreview } from "../components/CvPreview";
import { ProfileEditor } from "../components/ProfileEditor";
import { Button, Card, Field, Input, Notice, PageHeader, Select, Spinner, cx } from "../components/ui";
import { deleteImport, useCreateProfile, useImport } from "../lib/api";

export function ImportReviewPage() {
  const { id = "" } = useParams();
  const { data: rec, isLoading, error } = useImport(id);
  const create = useCreateProfile();
  const navigate = useNavigate();

  const [draft, setDraft] = useState<ProfileData | null>(null);
  const [name, setName] = useState("");
  const [language, setLanguage] = useState<Language>("en");
  const [panel, setPanel] = useState<"original" | "preview">("original");

  useEffect(() => {
    if (!rec || draft) return;
    setDraft(rec.draft);
    setLanguage(rec.detectedLanguage);
    setName(rec.draft.basics.headline || rec.fileName.replace(/\.(pdf|docx)$/i, ""));
  }, [rec, draft]);

  if (isLoading) return <Spinner className="text-muted" />;
  if (error || !rec) return <Notice tone="error">{(error as Error)?.message ?? "Import not found"}</Notice>;
  if (!draft) return null;

  const save = async () => {
    const profile = await create.mutateAsync({ name: name.trim(), language, data: draft });
    await deleteImport(rec.id).catch(() => {});
    navigate(`/profiles/${profile.id}`, { replace: true });
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Review import"
        description="Compare each section with the original text. Fix mappings, move entries between sections, and add anything that's missing."
      />
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <Field label="Profile name" className="min-w-60 flex-1">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="CV language">
          <Select value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {LANGUAGE_NAMES[l]}
              </option>
            ))}
          </Select>
        </Field>
        <Button
          variant="ghost"
          onClick={async () => {
            if (!confirm("Discard this import?")) return;
            await deleteImport(rec.id);
            navigate("/");
          }}
        >
          Discard
        </Button>
        <Button variant="primary" onClick={save} disabled={!name.trim() || create.isPending}>
          Save as profile
        </Button>
      </Card>

      {rec.status === "unmapped" && <Notice>Automatic mapping didn't run: {rec.error}</Notice>}
      {create.error && <Notice tone="error">{(create.error as Error).message}</Notice>}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-3 lg:sticky lg:top-8">
          <div className="inline-flex self-start rounded-lg bg-subtle p-1">
            {(["original", "preview"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPanel(p)}
                className={cx(
                  "rounded-md px-3 py-1 text-sm font-medium transition",
                  panel === p ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg",
                )}
              >
                {p === "original" ? `Original · ${rec.fileName}` : "CV preview"}
              </button>
            ))}
          </div>
          <div className="max-h-[calc(100dvh-8rem)] overflow-y-auto rounded-xl">
            {panel === "original" ? (
              <Card>
                <pre className="p-5 font-sans text-xs leading-relaxed whitespace-pre-wrap">{rec.text}</pre>
              </Card>
            ) : (
              <div className="bg-subtle p-5">
                <CvPreview data={draft} language={language} />
              </div>
            )}
          </div>
        </div>
        <ProfileEditor value={draft} onChange={setDraft} language={language} />
      </div>
    </div>
  );
}
