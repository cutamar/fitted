import { useState } from "react";
import { Copy, FilePlus2, Trash2, Upload } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { LANGUAGES, LANGUAGE_NAMES, emptyProfileData, type Language } from "@rb/shared";
import { CvThumbnail } from "../components/CvPreview";
import { Badge, Button, Card, Field, Input, Notice, PageHeader, Select, Spinner } from "../components/ui";
import { useCreateProfile, useDeleteProfile, useDuplicateProfile, useProfiles } from "../lib/api";

export function ProfilesPage() {
  const { data: profiles, isLoading, error } = useProfiles();
  const [creating, setCreating] = useState(false);
  const duplicate = useDuplicateProfile();
  const remove = useDeleteProfile();
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Master profiles"
        description="One complete CV per direction you apply for, e.g. DevOps and Product Owner. Every job application is tailored from one of them."
        actions={
          <>
            <Button onClick={() => setCreating(true)}>
              <FilePlus2 /> Start from scratch
            </Button>
            <Link to="/import">
              <Button variant="primary">
                <Upload /> Import CV
              </Button>
            </Link>
          </>
        }
      />

      {creating && <NewProfileForm onDone={() => setCreating(false)} />}
      {isLoading && <Spinner className="text-muted" />}
      {error && <Notice tone="error">{(error as Error).message}</Notice>}

      {profiles?.length === 0 && !creating && (
        <Card className="flex flex-col items-center px-6 py-14 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent-soft-fg">
            <Upload className="size-5" />
          </div>
          <h2 className="mt-4 font-semibold">Start with your current CV</h2>
          <p className="mt-1 max-w-sm text-sm text-muted">Import a PDF or Word file. It's split into sections you can review and correct.</p>
          <Link to="/import" className="mt-5">
            <Button variant="primary">Import CV</Button>
          </Link>
        </Card>
      )}

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {profiles?.map((p) => (
          <Card key={p.id} className="group overflow-hidden transition hover:shadow-md">
            <Link to={`/profiles/${p.id}`} className="block border-b border-border bg-subtle p-4">
              <div className="overflow-hidden rounded-sm shadow-(--shadow-paper) transition group-hover:-translate-y-0.5">
                <CvThumbnail data={p.data} language={p.language} />
              </div>
            </Link>
            <div className="p-4">
              <div className="flex items-start justify-between gap-2">
                <Link to={`/profiles/${p.id}`} className="truncate font-semibold hover:text-accent">
                  {p.name}
                </Link>
                <Badge>{p.language}</Badge>
              </div>
              <div className="mt-0.5 text-xs text-muted">Edited {new Date(p.updatedAt).toLocaleDateString()}</div>
              <div className="mt-3 flex gap-1">
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
                  <Copy /> Duplicate
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  className="ml-auto"
                  onClick={() => confirm(`Delete profile "${p.name}"? This cannot be undone.`) && remove.mutate(p.id)}
                >
                  <Trash2 />
                </Button>
              </div>
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
    <Card className="p-5">
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
