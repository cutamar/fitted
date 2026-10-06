import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { LANGUAGES, LANGUAGE_NAMES, emptyProfileData, type Language } from "@rb/shared";
import { Button, Card, Field, Input, Notice, Select, Spinner } from "../components/ui";
import { useCreateProfile, useDeleteProfile, useDuplicateProfile, useProfiles } from "../lib/api";

export function ProfilesPage() {
  const { data: profiles, isLoading, error } = useProfiles();
  const [creating, setCreating] = useState(false);
  const duplicate = useDuplicateProfile();
  const remove = useDeleteProfile();
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Master profiles</h1>
          <p className="mt-1 text-sm text-muted">
            One complete CV per direction you apply for (e.g. Product Owner, Sales). Each job is tailored from one of them.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setCreating(true)}>New empty profile</Button>
          <Link to="/import">
            <Button variant="primary">Import CV (PDF / DOCX)</Button>
          </Link>
        </div>
      </div>

      {creating && <NewProfileForm onDone={() => setCreating(false)} />}

      {isLoading && <Spinner className="text-muted" />}
      {error && <Notice tone="error">{(error as Error).message}</Notice>}

      {profiles?.length === 0 && !creating && (
        <Card className="p-10 text-center">
          <p className="text-sm text-muted">No profiles yet. Import your existing CV to get started.</p>
          <Link to="/import" className="mt-4 inline-block">
            <Button variant="primary">Import CV</Button>
          </Link>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {profiles?.map((p) => (
          <Card key={p.id} className="flex flex-col p-4">
            <div className="flex items-start justify-between gap-2">
              <Link to={`/profiles/${p.id}`} className="font-semibold hover:underline">
                {p.name}
              </Link>
              <span className="rounded bg-subtle px-1.5 py-0.5 text-xs font-medium uppercase text-muted">{p.language}</span>
            </div>
            <div className="mt-1 text-sm text-muted">{p.fullName || "No name set"}</div>
            <div className="mt-1 text-xs text-muted">
              {p.sectionCount} sections · updated {new Date(p.updatedAt).toLocaleDateString()}
            </div>
            <div className="mt-4 flex gap-1">
              <Link to={`/profiles/${p.id}`}>
                <Button size="sm">Edit</Button>
              </Link>
              <Button
                size="sm"
                variant="ghost"
                disabled={duplicate.isPending}
                onClick={async () => {
                  const name = prompt("Name for the copy", `${p.name} (copy)`);
                  if (!name) return;
                  const copy = await duplicate.mutateAsync({ id: p.id, name });
                  navigate(`/profiles/${copy.id}`);
                }}
              >
                Duplicate
              </Button>
              <Button
                size="sm"
                variant="danger"
                className="ml-auto"
                onClick={() => confirm(`Delete profile "${p.name}"? This cannot be undone.`) && remove.mutate(p.id)}
              >
                Delete
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function NewProfileForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [language, setLanguage] = useState<Language>("en");
  const create = useCreateProfile();
  const navigate = useNavigate();

  return (
    <Card className="p-4">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const p = await create.mutateAsync({ name: name.trim(), language, data: emptyProfileData(language) });
          onDone();
          navigate(`/profiles/${p.id}`);
        }}
      >
        <Field label="Profile name" className="min-w-60 flex-1">
          <Input autoFocus required placeholder="e.g. Product Owner" value={name} onChange={(e) => setName(e.target.value)} />
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
        <Button type="submit" variant="primary" disabled={!name.trim() || create.isPending}>
          Create
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </form>
    </Card>
  );
}
