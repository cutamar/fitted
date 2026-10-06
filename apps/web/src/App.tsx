import { useEffect, useState } from "react";
import { NavLink, Route, Routes, useSearchParams } from "react-router";
import { ChatGPTStatus } from "./components/ChatGPTStatus";
import { Notice, cx } from "./components/ui";
import { ImportPage } from "./pages/ImportPage";
import { ImportReviewPage } from "./pages/ImportReviewPage";
import { JobsPage } from "./pages/JobsPage";
import { ProfilePage } from "./pages/ProfilePage";
import { ProfilesPage } from "./pages/ProfilesPage";

export function App() {
  const authError = useAuthRedirectMessage();

  const nav = ({ isActive }: { isActive: boolean }) =>
    cx("rounded-md px-3 py-1.5 text-sm", isActive ? "bg-subtle font-medium text-fg" : "text-muted hover:text-fg");

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
          <span className="font-semibold tracking-tight">Resume Builder</span>
          <nav className="flex gap-1">
            <NavLink to="/" end className={nav}>
              Profiles
            </NavLink>
            <NavLink to="/jobs" className={nav}>
              Jobs
            </NavLink>
          </nav>
          <div className="ml-auto">
            <ChatGPTStatus />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        {authError && (
          <div className="mb-4">
            <Notice tone="error">{authError}</Notice>
          </div>
        )}
        <Routes>
          <Route path="/" element={<ProfilesPage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/imports/:id" element={<ImportReviewPage />} />
          <Route path="/profiles/:id" element={<ProfilePage />} />
          <Route path="/jobs" element={<JobsPage />} />
        </Routes>
      </main>
    </div>
  );
}

/** Reads ?auth_error / ?connected from the OAuth callback redirect and cleans the URL. */
function useAuthRedirectMessage() {
  const [params, setParams] = useSearchParams();
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    const err = params.get("auth_error");
    if (!err && !params.has("connected")) return;
    setMessage(err);
    params.delete("auth_error");
    params.delete("connected");
    setParams(params, { replace: true });
  }, [params, setParams]);
  return message;
}
