import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CheckCircle2, Clock, LogOut, NotebookPen } from "lucide-react";
import { redirect } from "@/i18n/navigation";
import { AutoRefresh } from "@/components/auto-refresh";
import { LangSwitch } from "@/components/nav";
import { ThemeButton } from "@/components/theme-toggle";
import { cn, Logo } from "@/components/ui";
import { signOut } from "@/lib/actions/auth";
import { getCook, requireUser } from "@/lib/mess";
import { todayDhaka } from "@/lib/dates";
import { fmtDate, fmtNumber, fmtTime } from "@/lib/format";
import type { MealKind } from "@/lib/types";
import { translateMenu } from "@/lib/dishes";
import { NeedsPanel } from "@/components/needs-panel";
import { NeedsList } from "@/components/needs-list";

type Kitchen = {
  mess: string;
  breakfast_enabled: boolean;
  breakfast: number; lunch: number; dinner: number;
  breakfast_cutoff: number; lunch_cutoff: number; dinner_cutoff: number;
  menu: (Partial<Record<MealKind, string | null>> & { note?: string | null }) | null;
  leave: Partial<Record<MealKind, boolean>>;
};

/** The cook's (khala's) only page: how many meals to cook today and what to cook. View only. */
export default async function KitchenPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { supabase } = await requireUser();
  const cook = await getCook();
  if (!cook) return redirect({ href: "/dashboard", locale });
  const t = await getTranslations();

  const today = todayDhaka();
  const { data, error } = await supabase.rpc("kitchen_day", { p_mess: cook.mess_id, p_date: today });
  if (error) throw new Error(`Could not load the kitchen: ${error.message}`);
  const k = data as Kitchen;
  // items khala already asked for that nobody has bought yet (shown with ⏳ on her buttons)
  const { data: open } = await supabase
    .from("bazar_needs")
    .select("item")
    .eq("mess_id", cook.mess_id)
    .eq("status", "open")
    .not("item", "is", null);
  const kinds: MealKind[] = k.breakfast_enabled ? ["breakfast", "lunch", "dinner"] : ["lunch", "dinner"];
  const now = Date.now();
  // cutoff = 00:00 of the day in Dhaka (UTC+6) + minutes
  const cutoffAt = (min: number) => Date.parse(`${today}T00:00:00Z`) - 6 * 3600e3 + min * 60e3;

  return (
    <div className="min-h-dvh">
      <AutoRefresh seconds={60} />
      <header className="border-b border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex h-16 max-w-xl items-center justify-between gap-2 px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <Logo className="size-9" />
            <span className="truncate text-lg font-semibold">{k.mess}</span>
          </div>
          <div className="flex items-center gap-1">
            <ThemeButton />
            <Suspense>
              <LangSwitch />
            </Suspense>
            <form action={signOut}>
              <button title={t("nav.signOut")} aria-label={t("nav.signOut")} className="grid size-10 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                <LogOut className="size-5" />
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-xl space-y-4 px-4 py-6">
        <div>
          <h1 className="text-2xl font-bold">{t("kitchen.title")}</h1>
          <p className="text-lg text-slate-500">{fmtDate(locale, today, { weekday: "long", day: "numeric", month: "long" })}</p>
        </div>

        {k.menu?.note && (
          <section className="rounded-3xl border-2 border-amber-300 bg-amber-50 p-5 text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <NotebookPen className="size-5" /> {t("kitchen.message")}
            </h2>
            <p className="mt-2 whitespace-pre-line text-2xl font-semibold leading-snug">{k.menu.note}</p>
          </section>
        )}

        {kinds.map((kind) => {
          const final = now >= cutoffAt(k[`${kind}_cutoff`]);
          const menu = translateMenu(k.menu?.[kind], locale);
          if (k.leave?.[kind]) {
            return (
              <section key={kind} className="rounded-3xl border border-slate-200/80 bg-slate-100 p-5 dark:border-slate-800 dark:bg-slate-900/60">
                <h2 className="text-xl font-semibold text-slate-600 dark:text-slate-300">{t(`meal.${kind}`)}</h2>
                <p className="mt-2 text-3xl font-bold text-slate-700 dark:text-slate-200">{t("kitchen.leave")}</p>
              </section>
            );
          }
          return (
            <section
              key={kind}
              className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <h2 className="text-xl font-semibold text-slate-600 dark:text-slate-300">{t(`meal.${kind}`)}</h2>
              <p className="mt-1 text-6xl font-extrabold tracking-tight text-brand-700 tabular-nums dark:text-brand-400">
                {fmtNumber(locale, k[kind])}
                <span className="ml-2 text-3xl font-bold text-slate-700 dark:text-slate-200">{t("kitchen.meals")}</span>
              </p>
              {menu && (
                <p className="mt-3 text-2xl font-semibold leading-snug">
                  <span className="text-slate-500">{t("kitchen.cook")}:</span> {menu}
                </p>
              )}
              <p
                className={cn(
                  "mt-4 flex items-center gap-2 rounded-xl px-3 py-2 text-lg font-medium",
                  final
                    ? "bg-brand-50 text-brand-800 dark:bg-brand-950/50 dark:text-brand-300"
                    : "bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
                )}
              >
                {final ? <CheckCircle2 className="size-5 shrink-0" /> : <Clock className="size-5 shrink-0" />}
                {final
                  ? t("kitchen.final")
                  : t("kitchen.mayChange", { time: fmtTime(locale, k[`${kind}_cutoff`]) })}
              </p>
            </section>
          );
        })}

        <NeedsPanel messId={cook.mess_id} pending={(open ?? []).map((x) => x.item as string)} />
        <NeedsList supabase={supabase} messId={cook.mess_id} locale={locale} forCook />
      </main>
    </div>
  );
}
