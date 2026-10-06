import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { LANGUAGES, LANGUAGE_NAMES, type Language, type ProfileData } from "@rb/shared";
import { ProfileEditor } from "../components/ProfileEditor";
import { Button, Card, Field, Input, Notice, Select, Spinner } from "../components/ui";
import { deleteImport, useCreateProfile, useImport } from "../lib/api";

export function ImportReviewPage() {
  const { id = "" } = useParams();
  const { data: rec, isLoading, error } = useImport(id);
  const create = useCreateProfile();
  const navigate = useNavigate();

  const [draft, setDraft] = useState<ProfileData | null>(null);
  const [name, setName] = useState("");
  const [language, setLanguage] = useState<Language>("en");

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
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Review import</h1>
        <p className="mt-1 text-sm text-muted">
          Check every section against the original text on the left. Fix wrong mappings, move entries between sections, add what's missing.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Profile name" className="mr-auto min-w-60 flex-1">
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
      </div>

      {rec.status === "unmapped" && <Notice>Automatic mapping didn't run: {rec.error}</Notice>}
      {create.error && <Notice tone="error">{(create.error as Error).message}</Notice>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card className="self-start lg:sticky lg:top-20">
          <div className="border-b border-border px-4 py-2 text-xs font-medium text-muted">Original text · {rec.fileName}</div>
          <pre className="max-h-[calc(100dvh-10rem)] overflow-auto whitespace-pre-wrap p-4 font-sans text-xs leading-relaxed">{rec.text}</pre>
        </Card>
        <ProfileEditor value={draft} onChange={setDraft} language={language} />
      </div>
    </div>
  );
}
