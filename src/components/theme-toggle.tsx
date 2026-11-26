"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Monitor, Moon, Sun } from "lucide-react";
import type { Theme } from "@/lib/theme";
import { cn } from "./ui";

declare global {
  interface Window {
    __setTheme?: (t: Theme) => void;
    __applyTheme?: () => void;
  }
}

/**
 * Switching language re-renders <html> (new lang), which wipes the theme class the head script set.
 * Put the saved theme back right away, before the browser paints.
 */
export function ThemeSync() {
  const locale = useLocale();
  useLayoutEffect(() => {
    window.__applyTheme?.();
  }, [locale]);
  return null;
}

const ORDER: Theme[] = ["light", "dark", "system"];
const ICON = { light: Sun, dark: Moon, system: Monitor };

function useTheme() {
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => {
    setTheme((document.documentElement.dataset.theme as Theme) || "system");
  }, []);
  const set = (t: Theme) => {
    window.__setTheme?.(t);
    setTheme(t);
  };
  return [theme, set] as const;
}

/** Compact header button: tap to cycle light → dark → system. */
export function ThemeButton({ className }: { className?: string }) {
  const t = useTranslations("theme");
  const [theme, set] = useTheme();
  const Icon = ICON[theme];
  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
  return (
    <button
      type="button"
      onClick={() => set(next)}
      title={`${t("label")}: ${t(theme)}`}
      aria-label={`${t("label")}: ${t(theme)}`}
      className={cn("rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800", className)}
    >
      <Icon className="size-[18px]" />
    </button>
  );
}

/** Full three-way switch with labels (More page). */
export function ThemeSwitch() {
  const t = useTranslations("theme");
  const [theme, set] = useTheme();
  return (
    <div role="radiogroup" aria-label={t("label")} className="grid grid-cols-3 gap-1 rounded-2xl bg-slate-200/70 p-1 dark:bg-slate-800">
      {ORDER.map((k) => {
        const Icon = ICON[k];
        return (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={theme === k}
            onClick={() => set(k)}
            className={cn(
              "flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition",
              theme === k
                ? "bg-white text-brand-700 shadow-sm dark:bg-slate-900 dark:text-brand-400"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200",
            )}
          >
            <Icon className="size-4" /> {t(k)}
          </button>
        );
      })}
    </div>
  );
}
