import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from "react";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type Variant = "primary" | "secondary" | "ghost" | "danger" | "soft";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg shadow-sm hover:bg-accent-hover",
  secondary: "border border-border bg-surface shadow-(--shadow-card) hover:bg-subtle",
  soft: "bg-accent-soft text-accent-soft-fg hover:brightness-95",
  ghost: "text-muted hover:bg-subtle hover:text-fg",
  danger: "text-danger hover:bg-subtle",
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "icon" }) {
  return (
    <button
      type="button"
      className={cx(
        "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-4",
        size === "sm" && "h-8 px-2.5 text-xs",
        size === "md" && "h-9 px-3.5 text-sm",
        size === "icon" && "size-8",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

const fieldBase =
  "rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition placeholder:text-muted/60 focus:border-accent focus:ring-3 focus:ring-accent/15 disabled:opacity-60";

/** Fields are full width unless the caller sets a width. */
const width = (className?: string) => (/(^|\s)w-/.test(className ?? "") ? "" : "w-full");

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(fieldBase, width(className), className)} {...props} />;
}

/** Textarea that grows with its content. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, value, ...props },
  forwarded,
) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(forwarded, () => ref.current!);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return <textarea ref={ref} rows={1} value={value} className={cx(fieldBase, "w-full resize-none leading-relaxed", className)} {...props} />;
});

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx(fieldBase, width(className), "pr-8", className)} {...props} />;
}

export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx("flex flex-col gap-1.5", className)}>
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("rounded-xl border border-border bg-surface shadow-(--shadow-card)", className)}>{children}</div>;
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase",
        tone === "accent" ? "bg-accent-soft text-accent-soft-fg" : "bg-subtle text-muted",
      )}
    >
      {children}
    </span>
  );
}

export function Notice({ tone = "warn", children }: { tone?: "warn" | "error"; children: ReactNode }) {
  return (
    <div className={cx("rounded-lg px-3.5 py-2.5 text-sm", tone === "warn" ? "bg-warn-bg text-warn-fg" : "bg-subtle text-danger")}>{children}</div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cx("inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent", className)} />;
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
