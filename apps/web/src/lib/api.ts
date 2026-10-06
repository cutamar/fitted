import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AuthStatus, ChatGPTModel, ImportRecord, Profile, ProfileInput } from "@rb/shared";

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
