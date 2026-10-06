import { useEffect, useRef, useState } from "react";
import { loginUrl, useAuthStatus, useLogout, useModels, useSetModel } from "../lib/api";
import { Button, Select, Spinner } from "./ui";

export function ChatGPTStatus() {
  const { data: status, isLoading } = useAuthStatus();
  const connected = status?.connected === true;
  const models = useModels(connected && status.sharing);
  const setModel = useSetModel();
  const logout = useLogout();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  if (isLoading || !status) return <Spinner className="text-muted" />;

  if (!status.connected) {
    return (
      <a href={loginUrl()}>
        <Button variant="primary">Sign in with ChatGPT</Button>
      </a>
    );
  }

  const label = status.name ?? status.email ?? "ChatGPT";
  return (
    <div className="relative" ref={ref}>
      <Button variant="ghost" onClick={() => setOpen((o) => !o)}>
        <span className={`size-2 rounded-full ${status.sharing ? "bg-accent" : "bg-warn-fg"}`} />
        <span className="max-w-48 truncate">{label}</span>
      </Button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-80 rounded-lg border border-border bg-surface p-3 shadow-lg">
          <div className="text-sm font-medium">{status.email}</div>
          <div className="mt-0.5 text-xs text-muted">
            {status.sharing ? "Using your ChatGPT plan." : "Plan usage was not granted. Sign in again and allow it to use AI features."}
          </div>
          {status.sharing && (
            <div className="mt-3">
              <div className="mb-1 text-xs font-medium text-muted">Model</div>
              {models.isLoading ? (
                <Spinner className="text-muted" />
              ) : models.error ? (
                <div className="text-xs text-danger">{(models.error as Error).message}</div>
              ) : (
                <Select value={status.selectedModel ?? ""} onChange={(e) => setModel.mutate(e.target.value || null)}>
                  <option value="">Default ({models.data?.[0]?.displayName ?? "first available"})</option>
                  {models.data?.map((m) => (
                    <option key={m.slug} value={m.slug}>
                      {m.displayName}
                    </option>
                  ))}
                </Select>
              )}
            </div>
          )}
          <div className="mt-3 flex justify-between border-t border-border pt-3">
            <a href={loginUrl(true)} className="text-xs text-muted hover:text-fg">
              Use another account
            </a>
            <Button size="sm" variant="danger" onClick={() => logout.mutate()} disabled={logout.isPending}>
              Sign out
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
