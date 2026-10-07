import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AppStatus, AuthStatus, ChatGPTModel, CreateJob, ImportRecord, Job, Profile, ProfileInput, SuggestionStatus } from "@rb/shared";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const res = await fetch(`/api${path}`, { ...init, headers });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, body?.error ?? `Request failed (${res.status})`, body?.code);
  return body as T;
}

const json = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });

// --- ChatGPT -----------------------------------------------------------------

export const loginUrl = (fresh = false) => `/api/auth/login${fresh ? "?fresh=1" : ""}`;

export function useAuthStatus() {
  return useQuery({ queryKey: ["auth"], queryFn: () => request<AuthStatus>("/auth/status") });
}

export function useModels(enabled: boolean) {
  return useQuery({ queryKey: ["models"], queryFn: () => request<ChatGPTModel[]>("/auth/models"), enabled, staleTime: 5 * 60_000 });
}

export function useSetModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (model: string | null) => request("/auth/model", json("PUT", { model })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["auth"] }),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => request("/auth/logout", json("POST")),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["auth"] }),
  });
}

// --- Profiles ----------------------------------------------------------------

export function useProfiles() {
  return useQuery({ queryKey: ["profiles"], queryFn: () => request<Profile[]>("/profiles") });
}

export function useProfile(id: string) {
  return useQuery({ queryKey: ["profiles", id], queryFn: () => request<Profile>(`/profiles/${id}`) });
}

export function useCreateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ProfileInput) => request<Profile>("/profiles", json("POST", input)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profiles"] }),
  });
}

export function useUpdateProfile(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ProfileInput) => request<Profile>(`/profiles/${id}`, json("PUT", input)),
    onSuccess: (p) => {
      qc.setQueryData(["profiles", id], p);
      qc.invalidateQueries({ queryKey: ["profiles"], exact: true });
    },
  });
}

export function useDuplicateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name?: string }) => request<Profile>(`/profiles/${id}/duplicate`, json("POST", { name })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profiles"] }),
  });
}

export function useDeleteProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => request(`/profiles/${id}`, json("DELETE")),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profiles"] }),
  });
}

// --- Imports -----------------------------------------------------------------

export function useUploadCv() {
  return useMutation({
    mutationFn: (file: File) => {
      const body = new FormData();
      body.set("file", file);
      return request<ImportRecord>("/imports", { method: "POST", body });
    },
  });
}

export function useImport(id: string) {
  return useQuery({ queryKey: ["imports", id], queryFn: () => request<ImportRecord>(`/imports/${id}`) });
}

export function deleteImport(id: string) {
  return request(`/imports/${id}`, json("DELETE"));
}

// --- Jobs --------------------------------------------------------------------

export function useJobs() {
  return useQuery({
    queryKey: ["jobs"],
    queryFn: () => request<Job[]>("/jobs"),
    refetchInterval: (q) => (q.state.data?.some((j) => j.status === "analyzing") ? 3000 : false),
  });
}

export function useJob(id: string) {
  return useQuery({
    queryKey: ["jobs", id],
    queryFn: () => request<Job>(`/jobs/${id}`),
    refetchInterval: (q) => (q.state.data?.status === "analyzing" ? 2000 : false),
  });
}

export function useCreateJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateJob) => request<Job>("/jobs", json("POST", input)),
    onSuccess: (job) => {
      qc.setQueryData(["jobs", job.id], job);
      qc.invalidateQueries({ queryKey: ["jobs"], exact: true });
    },
  });
}

export function useDeleteJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => request(`/jobs/${id}`, json("DELETE")),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs"] }),
  });
}

/** All job mutations return the updated job; this keeps the cache in sync. */
function useJobMutation<V>(id: string, fn: (v: V) => Promise<Job>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (job) => {
      qc.setQueryData(["jobs", id], job);
      qc.invalidateQueries({ queryKey: ["jobs"], exact: true });
    },
  });
}

export interface SuggestionPatch {
  status?: SuggestionStatus;
  editedText?: string | null;
  editedTags?: string[] | null;
}

export function useJobActions(id: string) {
  const qc = useQueryClient();
  const patchSuggestion = useJobMutation(id, ({ sid, patch }: { sid: string; patch: SuggestionPatch }) =>
    request<Job>(`/jobs/${id}/suggestions/${sid}`, json("PATCH", patch)),
  );
  return {
    /** Optimistic so accept/reject feels instant. */
    patchSuggestion: {
      ...patchSuggestion,
      mutate: (v: { sid: string; patch: SuggestionPatch }) => {
        qc.setQueryData<Job>(["jobs", id], (job) =>
          job && { ...job, suggestions: job.suggestions.map((s) => (s.id === v.sid ? { ...s, ...v.patch } : s)) },
        );
        patchSuggestion.mutate(v);
      },
    },
    bulk: useJobMutation(id, (v: { ids: string[]; status: SuggestionStatus }) => request<Job>(`/jobs/${id}/suggestions/bulk`, json("POST", v))),
    regenerate: useJobMutation(id, ({ sid, instruction }: { sid: string; instruction: string }) =>
      request<Job>(`/jobs/${id}/suggestions/${sid}/regenerate`, json("POST", { instruction })),
    ),
    assess: useJobMutation(id, () => request<Job>(`/jobs/${id}/assess`, json("POST"))),
    tracking: useJobMutation(id, (v: { appStatus?: AppStatus; notes?: string }) => request<Job>(`/jobs/${id}/tracking`, json("PATCH", v))),
    writeLetter: useJobMutation(id, (instructions: string) => request<Job>(`/jobs/${id}/cover-letter`, json("POST", { instructions }))),
    saveLetter: useJobMutation(id, (text: string) => request<Job>(`/jobs/${id}/cover-letter`, json("PUT", { text }))),
    reanalyze: useJobMutation(id, (v: { refreshProfile: boolean; instructions?: string }) => request<Job>(`/jobs/${id}/analyze`, json("POST", v))),
  };
}

// --- Export ------------------------------------------------------------------

export type ExportKind = "profile" | "job" | "sent";

export interface AtsReport {
  format: "pdf" | "docx";
  ok: boolean;
  pages: number | null;
  total: number;
  found: number;
  missing: { label: string; text: string }[];
  orderOk: boolean;
  text: string;
}

export const exportUrl = (kind: ExportKind, id: string, format: "pdf" | "docx") => `/api/export/${kind}/${id}/cv.${format}`;

export function useAtsCheck(kind: ExportKind, id: string) {
  return useMutation({ mutationFn: () => request<AtsReport[]>(`/export/${kind}/${id}/check`) });
}

export const letterUrl = (jobId: string, format: "pdf" | "docx", sent = false) => `/api/export/letter/${jobId}/letter.${format}${sent ? "?sent=1" : ""}`;

/** Downloads via fetch so server errors (e.g. missing Chromium) surface as messages. */
export async function downloadFile(url: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `Export failed (${res.status})`);
  const name = res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ?? url.split("/").pop()!;
  const href = URL.createObjectURL(await res.blob());
  Object.assign(document.createElement("a"), { href, download: name }).click();
  URL.revokeObjectURL(href);
}

export interface AddToCvInput {
  requirementId?: string;
  keyword?: string;
  keywords?: string[];
  details: string;
  itemId?: string;
}

/** Creates one suggestion that covers a requirement or keyword. */
export function useAddToCv(jobId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: AddToCvInput) => request<{ job: Job; suggestionId: string }>(`/jobs/${jobId}/suggestions/add`, json("POST", v)),
    onSuccess: ({ job }) => qc.setQueryData(["jobs", jobId], job),
  });
}

// --- Quick boost ------------------------------------------------------------------

export function useBoost(jobId: string) {
  const qc = useQueryClient();
  const set = (job: Job) => qc.setQueryData(["jobs", jobId], job);
  return {
    ask: useMutation({ mutationFn: () => request<Job>(`/jobs/${jobId}/boost`, json("POST")), onSuccess: set }),
    apply: useMutation({
      mutationFn: (v: { answers: { id: string; answer: "yes" | "no"; details: string }[]; acceptSafe: boolean }) =>
        request<{ job: Job; added: number; acceptedSafe: number }>(`/jobs/${jobId}/boost/apply`, json("POST", v)),
      onSuccess: (r) => set(r.job),
    }),
  };
}
