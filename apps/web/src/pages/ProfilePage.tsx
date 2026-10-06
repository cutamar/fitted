import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { LANGUAGES, LANGUAGE_NAMES, type ProfileInput } from "@rb/shared";
import { ProfileEditor } from "../components/ProfileEditor";
import { Button, Field, Input, Notice, Select, Spinner } from "../components/ui";
import { useProfile, useUpdateProfile } from "../lib/api";

export function ProfilePage() {
  const { id = "" } = useParams();
  const { data: profile, isLoading, error } = useProfile(id);
  const update = useUpdateProfile(id);
  const [draft, setDraft] = useState<ProfileInput | null>(null);

  useEffect(() => setDraft(null), [id]);

  useEffect(() => {
    if (profile && !draft) setDraft({ name: profile.name, language: profile.language, data: profile.data });
  }, [profile, draft]);

  const saved = profile && JSON.stringify({ name: profile.name, language: profile.language, data: profile.data });
  const dirty = draft !== null && JSON.stringify(draft) !== saved;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  if (isLoading) return <Spinner className="text-muted" />;
  if (error || !profile) return <Notice tone="error">{(error as Error)?.message ?? "Profile not found"}</Notice>;
  if (!draft) return null;

  const save = () => update.mutate(draft);

  return (
    <div
      className="mx-auto flex max-w-4xl flex-col gap-4"
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "s") {
          e.preventDefault();
          if (dirty) save();
        }
      }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Profile name" className="mr-auto min-w-60 flex-1">
          <Input className="text-base font-semibold" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </Field>
        <Field label="CV language">
          <Select value={draft.language} onChange={(e) => setDraft({ ...draft, language: e.target.value as ProfileInput["language"] })}>
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {LANGUAGE_NAMES[l]}
              </option>
            ))}
          </Select>
        </Field>
        <span className="h-9 content-center text-xs text-muted">{update.isPending ? "Saving…" : dirty ? "Unsaved changes" : "All changes saved"}</span>
        <Button variant="primary" onClick={save} disabled={!dirty || !draft.name.trim() || update.isPending}>
          Save
        </Button>
      </div>
      {update.error && <Notice tone="error">{(update.error as Error).message}</Notice>}
      <ProfileEditor value={draft.data} onChange={(data) => setDraft({ ...draft, data })} language={draft.language} />
    </div>
  );
}
