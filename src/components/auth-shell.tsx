import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { LangSwitch } from "./nav";
import { ThemeButton } from "./theme-toggle";
import { Logo } from "./ui";

export async function AuthShell({ children }: { children: ReactNode }) {
  const t = await getTranslations("app");
  return (
    <div className="relative min-h-dvh overflow-hidden">
      {/* soft brand glow behind the card */}
      <div className="pointer-events-none absolute inset-x-0 -top-40 h-96 bg-gradient-to-b from-brand-200/60 to-transparent blur-3xl dark:from-brand-900/40" />
      <main className="relative mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo className="size-12" />
            <div>
              <div className="text-2xl font-bold tracking-tight text-brand-700 dark:text-brand-400">{t("name")}</div>
              <p className="text-sm text-slate-500">{t("tagline")}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <ThemeButton />
            <LangSwitch />
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}
