"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, KeyRound, Pencil, ReceiptText } from "lucide-react";
import { btn, cn } from "./ui";

const ICONS = { login: KeyRound, password: KeyRound, bills: ReceiptText, edit: Pencil } as const;
export type RowPanel = { key: string; label: ReactNode; icon: keyof typeof ICONS; highlight?: boolean; content: ReactNode };

/**
 * A tidy row of action buttons under a list item; one panel opens below at a time.
 * Keeps long lists (members) short on phones instead of stacking every form.
 */
export function RowPanels({ panels }: { panels: RowPanel[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!panels.length) return null;
  const current = panels.find((p) => p.key === open);
  return (
    <div className="mt-2">
      <div className="flex flex-wrap gap-2">
        {panels.map((p) => {
          const Icon = ICONS[p.icon];
          const active = open === p.key;
          return (
            <button
              key={p.key}
              type="button"
              aria-expanded={active}
              onClick={() => setOpen(active ? null : p.key)}
              className={cn(
                btn.small,
                active && "border-brand-500 bg-brand-50 text-brand-800 dark:border-brand-700 dark:bg-brand-950/50 dark:text-brand-200",
                !active && p.highlight && "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
              )}
            >
              <Icon className="size-4" />
              {p.label}
              <ChevronDown className={cn("size-3.5 opacity-60 transition", active && "rotate-180")} />
            </button>
          );
        })}
      </div>
      {current && <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/40">{current.content}</div>}
    </div>
  );
}
