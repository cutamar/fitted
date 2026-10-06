import { LogOut, Sparkles } from "lucide-react";
import { loginUrl, useAuthStatus, useLogout, useModels, useSetModel } from "../lib/api";
import { Button, Select, Spinner, cx } from "./ui";

/** ChatGPT connection, shown at the bottom of the sidebar. */
export function AccountCard({ compact = false }: { compact?: boolean }) {
  const { data: status, isLoading } = useAuthStatus();
  const connected = status?.connected === true;
  const models = useModels(connected && status.sharing);
  const setModel = useSetModel();
  const logout = useLogout();

  if (isLoading || !status) return <Spinner className="text-muted" />;

  if (!status.connected) {
    return (
      <div className={cx(!compact && "rounded-xl border border-border bg-surface p-3")}>
        {!compact && <p className="mb-2 text-xs text-muted">Connect your ChatGPT Plus or Pro plan to use AI features.</p>}
        <a href={loginUrl()} className="block">
          <Button variant="primary" className="w-full">
            <Sparkles /> Sign in with ChatGPT
          </Button>
        </a>
      </div>
    );
  }

  const label = status.name ?? status.email ?? "ChatGPT";
  if (compact) {
    return (
      <span className="flex items-center gap-2 text-sm">
        <span className={cx("size-2 rounded-full", status.sharing ? "bg-success" : "bg-warn-fg")} />
        <span className="max-w-32 truncate">{label}</span>
      </span>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="flex items-center gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent-soft-fg">
          {label.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{label}</div>
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <span className={cx("size-1.5 rounded-full", status.sharing ? "bg-success" : "bg-warn-fg")} />
            {status.sharing ? "ChatGPT plan connected" : "Plan usage not granted"}
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={() => logout.mutate()} disabled={logout.isPending} title="Sign out">
          <LogOut />
        </Button>
      </div>
      {status.sharing ? (
        <div className="mt-3">
          {models.error ? (
            <div className="text-xs text-danger">{(models.error as Error).message}</div>
          ) : (
            <Select
              className="h-8 py-0 text-xs"
              aria-label="Model"
              value={status.selectedModel ?? ""}
              disabled={models.isLoading}
              onChange={(e) => setModel.mutate(e.target.value || null)}
            >
              <option value="">Model: default ({models.data?.[0]?.displayName ?? "…"})</option>
              {models.data?.map((m) => (
                <option key={m.slug} value={m.slug}>
                  Model: {m.displayName}
                </option>
              ))}
            </Select>
          )}
        </div>
      ) : (
        <a href={loginUrl()} className="mt-2 block text-xs font-medium text-accent">
          Sign in again and allow plan usage →
        </a>
      )}
      <a href={loginUrl(true)} className="mt-2 block text-[11px] text-muted hover:text-fg">
        Use another ChatGPT account
      </a>
    </div>
  );
}
