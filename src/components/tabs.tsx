"use client";

import { useState, type ReactNode } from "react";
import { cn } from "./ui";

type Tab = { key: string; label: ReactNode; icon?: ReactNode; content: ReactNode };

/** Segmented tabs. Panels stay mounted (just hidden) so typed form input survives a switch. */
export function Tabs({ tabs, initial }: { tabs: Tab[]; initial?: string }) {
  const [active, setActive] = useState(initial ?? tabs[0]?.key);
  if (tabs.length === 1) return <>{tabs[0].content}</>;
  return (
    <div className="space-y-4">
      <div role="tablist" className="grid grid-flow-col auto-cols-fr gap-1 rounded-2xl bg-slate-200/70 p-1 dark:bg-slate-800">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active === t.key}
            onClick={() => setActive(t.key)}
            className={cn(
              "flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition",
              active === t.key
                ? "bg-white text-brand-700 shadow-sm dark:bg-slate-900 dark:text-brand-400"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200",
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.key} role="tabpanel" hidden={active !== t.key}>
          {t.content}
        </div>
      ))}
    </div>
  );
}
