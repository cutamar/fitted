import { useEffect, useState } from "react";
import { Briefcase, FileText } from "lucide-react";
import { NavLink, Route, Routes, useSearchParams } from "react-router";
import { BRAND } from "@rb/shared";
import { AccountCard } from "./components/AccountCard";
import { Logo } from "./components/Logo";
import { Notice, cx } from "./components/ui";
import { ImportPage } from "./pages/ImportPage";
import { ImportReviewPage } from "./pages/ImportReviewPage";
import { JobPage } from "./pages/JobPage";
import { JobsPage } from "./pages/JobsPage";
import { ProfilePage } from "./pages/ProfilePage";
import { ProfilesPage } from "./pages/ProfilesPage";

const NAV = [
  { to: "/", label: "Profiles", icon: FileText, end: true },
  { to: "/jobs", label: "Jobs", icon: Briefcase, end: false },
];

export function App() {
  const authError = useAuthRedirectMessage();

  const navClass = ({ isActive }: { isActive: boolean }) =>
    cx(
      "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition [&_svg]:size-4",
      isActive ? "bg-accent-soft text-accent-soft-fg" : "text-muted hover:bg-subtle hover:text-fg",
    );

  return (
    <div className="min-h-dvh md:pl-64">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-border bg-surface px-4 py-5 md:flex">
        <div className="px-1">
          <Logo />
          <p className="mt-1 text-xs text-muted">{BRAND.tagline}</p>
        </div>
        <nav className="mt-8 flex flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={navClass}>
              <Icon /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto">
          <AccountCard />
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur md:hidden">
        <Logo />
        <nav className="flex gap-1">
          {NAV.map(({ to, label, end }) => (
            <NavLink key={to} to={to} end={end} className={navClass}>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto">
          <AccountCard compact />
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 py-6 md:px-8 md:py-8">
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
          <Route path="/jobs/:id" element={<JobPage />} />
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
