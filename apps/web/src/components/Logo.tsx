import { BRAND } from "@rb/shared";

/** Document with a check: a CV that fits. */
export function LogoMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" className="fill-accent" />
      <path d="M10 7h8.5L23 11.5V25H10z" fill="#fff" />
      <path d="M18.5 7v4.5H23" fill="#c7c4ff" />
      <path d="M13 18.2l2.4 2.4 4.6-5" fill="none" stroke="#4f46e5" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      <span className="text-lg font-semibold tracking-tight">{BRAND.name}</span>
    </span>
  );
}
