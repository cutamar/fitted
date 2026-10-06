import { useEffect, useState } from "react";
import { ArrowLeft, Check } from "lucide-react";
import { Link, useParams } from "react-router";
import { LANGUAGES, LANGUAGE_NAMES, type ProfileInput } from "@rb/shared";
import { CvPreview } from "../components/CvPreview";
import { ProfileEditor } from "../components/ProfileEditor";
import { Button, Notice, Select, Spinner } from "../components/ui";
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
      className="flex flex-col gap-5"
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "s") {
          e.preventDefault();
          if (dirty) save();
        }
      }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/">
          <Button variant="ghost" size="icon" title="All profiles">
            <ArrowLeft />
          </Button>
        </Link>
        <input
          className="min-w-48 flex-1 rounded-md bg-transparent px-1 text-2xl font-semibold tracking-tight outline-none hover:bg-subtle focus:bg-subtle"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          aria-label="Profile name"
        />
        <Select
          className="w-auto"
          value={draft.language}
          onChange={(e) => setDraft({ ...draft, language: e.target.value as ProfileInput["language"] })}
          aria-label="CV language"
          title="CV language: suggestions are always written in this language"
        >
          {LANGUAGES.map((l) => (
            <option key={l} value={l}>
              {LANGUAGE_NAMES[l]}
            </option>
          ))}
        </Select>
        <span className="flex items-center gap-1 text-xs text-muted">
          {update.isPending ? "Saving…" : dirty ? "Unsaved changes" : (
            <>
              <Check className="size-3.5 text-success" /> Saved
            </>
          )}
        </span>
        <Button variant="primary" onClick={save} disabled={!dirty || !draft.name.trim() || update.isPending}>
          Save
        </Button>
      </div>
      {update.error && <Notice tone="error">{(update.error as Error).message}</Notice>}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <ProfileEditor value={draft.data} onChange={(data) => setDraft({ ...draft, data })} language={draft.language} />
        <div className="sticky top-8 hidden max-h-[calc(100dvh-4rem)] overflow-y-auto rounded-xl bg-subtle p-5 xl:block">
          <CvPreview data={draft.data} language={draft.language} />
        </div>
      </div>
    </div>
  );
}
