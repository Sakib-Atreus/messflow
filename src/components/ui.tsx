import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

// One input look everywhere: 44px tall (easy to tap), soft focus ring, works in dark mode.
export const inputClass =
  "block min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 shadow-xs outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-brand-400/20 dark:disabled:bg-slate-800/60";

// Button family. Shared: keyboard focus ring, pressed effect, disabled look, icon spacing.
const base =
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-medium transition outline-none focus-visible:ring-4 focus-visible:ring-brand-500/30 active:scale-[.98] disabled:pointer-events-none disabled:opacity-55";
export const btn = {
  /** main action of a screen or form */
  primary: `${base} min-h-11 rounded-xl bg-brand-600 px-5 text-white shadow-sm shadow-brand-900/10 hover:bg-brand-700`,
  /** neutral action next to a primary one */
  secondary: `${base} min-h-11 rounded-xl border border-slate-300 bg-white px-5 text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800`,
  /** compact positive action inside lists (Approve, Open) */
  approve: `${base} min-h-9 rounded-lg bg-brand-600 px-3.5 text-sm text-white hover:bg-brand-700`,
  /** compact destructive action inside lists (Delete, Reject) */
  danger: `${base} min-h-9 rounded-lg border border-red-200 bg-white px-3 text-sm text-red-600 hover:border-red-300 hover:bg-red-50 focus-visible:ring-red-500/25 dark:border-red-900/60 dark:bg-transparent dark:text-red-400 dark:hover:bg-red-950/60`,
  /** confirm button of a destructive dialog */
  dangerSolid: `${base} min-h-11 rounded-xl bg-red-600 px-5 text-white hover:bg-red-700 focus-visible:ring-red-500/30`,
  /** compact neutral action inside lists (Pin, Copy, Share) */
  small: `${base} min-h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800`,
  /** text-like action with no frame */
  ghost: `${base} min-h-9 rounded-lg px-2.5 text-sm text-brand-700 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-950/50`,
  /** square icon-only button */
  icon: `${base} size-9 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-100`,
};

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("size-4 shrink-0 animate-spin", className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Card({
  title, action, children, className, icon: Icon,
}: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; icon?: LucideIcon }) {
  return (
    <section className={cn("rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5 dark:border-slate-800 dark:bg-slate-900", className)}>
      {(title || action) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && (
            <h2 className="flex items-center gap-2 text-base font-semibold sm:text-lg">
              {Icon && <Icon className="size-5 text-brand-600 dark:text-brand-400" />}
              {title}
            </h2>
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageTitle({ children, action, sub }: { children: ReactNode; action?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{children}</h1>
        {sub && <p className="text-sm text-slate-500 dark:text-slate-400">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function Stat({
  label, value, tone, icon: Icon, hint, className,
}: { label: ReactNode; value: ReactNode; tone?: "good" | "bad" | "muted"; icon?: LucideIcon; hint?: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900", className)}>
      <div className="flex items-center justify-between gap-2 text-sm text-slate-500 dark:text-slate-400">
        <span>{label}</span>
        {Icon && (
          <span className="grid size-8 place-items-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-400">
            <Icon className="size-4" />
          </span>
        )}
      </div>
      <div
        className={cn(
          "mt-1 text-2xl font-bold tabular-nums",
          tone === "good" && "text-brand-600 dark:text-brand-400",
          tone === "bad" && "text-red-600 dark:text-red-400",
          tone === "muted" && "text-slate-500",
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "green" | "red" | "amber" | "blue" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    green: "bg-brand-100 text-brand-800 dark:bg-brand-950 dark:text-brand-300",
    red: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
    amber: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    blue: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  };
  return <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs font-medium", tones[tone])}>{children}</span>;
}

export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>
      {children}
      {hint && <span className="block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

/** Friendly "nothing here yet" block. */
export function Empty({ children, icon: Icon }: { children: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
        {Icon ? <Icon className="size-5" /> : <span className="text-lg">∅</span>}
      </span>
      <p className="max-w-xs text-sm text-slate-500 dark:text-slate-400">{children}</p>
    </div>
  );
}

export function Checkbox({ name, label, defaultChecked }: { name: string; label: ReactNode; defaultChecked?: boolean }) {
  return (
    <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg pr-2 select-none">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="size-5 rounded accent-brand-600" />
      <span>{label}</span>
    </label>
  );
}

export function Logo({ className }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/logo.svg" alt="" className={cn("size-8 shrink-0", className)} />;
}

export function Avatar({ name, className, src }: { name: string; className?: string; src?: string | null }) {
  const initials = name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" loading="lazy" className={cn("size-9 shrink-0 rounded-full object-cover ring-1 ring-black/5", className)} />;
  }
  return (
    <span className={cn("grid size-9 shrink-0 place-items-center rounded-full bg-brand-100 text-sm font-semibold text-brand-800 dark:bg-brand-950 dark:text-brand-300", className)}>
      {initials}
    </span>
  );
}

/** Highlighted call-to-action strip, e.g. "3 requests waiting". */
export function Alert({ children, tone = "amber", className }: { children: ReactNode; tone?: "amber" | "green" | "blue" | "red"; className?: string }) {
  const tones = {
    amber: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
    green: "border-brand-300 bg-brand-50 text-brand-900 dark:border-brand-800 dark:bg-brand-950/40 dark:text-brand-200",
    blue: "border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200",
    red: "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200",
  };
  return <div className={cn("rounded-2xl border px-4 py-3", tones[tone], className)}>{children}</div>;
}
