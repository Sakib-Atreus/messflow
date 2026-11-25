"use client";

import { useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Search, X } from "lucide-react";

/**
 * Search box over a server-rendered list: hides items marked `data-search` whose text doesn't
 * contain what you type (names, rooms, phones, amounts, methods, notes…).
 */
export function ListSearch({ children, placeholder }: { children: ReactNode; placeholder?: string }) {
  const t = useTranslations("common");
  const box = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  const [none, setNone] = useState(false);

  const filter = (value: string) => {
    setQ(value);
    const needle = value.trim().toLowerCase();
    let shown = 0;
    box.current?.querySelectorAll<HTMLElement>("[data-search]").forEach((el) => {
      const hit = !needle || (el.dataset.search ?? el.textContent ?? "").toLowerCase().includes(needle);
      el.hidden = !hit;
      if (hit) shown++;
    });
    setNone(!!needle && shown === 0);
  };

  return (
    <div ref={box}>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={q}
          onChange={(e) => filter(e.target.value)}
          placeholder={placeholder ?? t("search")}
          aria-label={placeholder ?? t("search")}
          className="block min-h-10 w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-9 text-sm outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 dark:border-slate-700 dark:bg-slate-900"
        />
        {q && (
          <button type="button" onClick={() => filter("")} aria-label={t("clear")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:text-slate-700">
            <X className="size-4" />
          </button>
        )}
      </div>
      {children}
      {none && <p className="py-6 text-center text-sm text-slate-500">{t("noMatches", { q })}</p>}
    </div>
  );
}
