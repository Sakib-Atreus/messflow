import { getTranslations } from "next-intl/server";
import { ChefHat } from "lucide-react";
import { ActionButton } from "@/components/action-button";
import { Badge, btn } from "@/components/ui";
import { offerToCook } from "@/lib/actions/people";
import { addDays, todayDhaka } from "@/lib/dates";
import { fmtDate } from "@/lib/format";
import type { CookLeave } from "@/lib/leave";

/**
 * "Khala on leave" notice for members: which meals are off, who will cook (if anyone),
 * and an "I'll cook" button. `myMemberId` is null for someone who can't offer (e.g. the admin view).
 */
export async function LeaveBanner({ leaves, locale, myMemberId }: { leaves: CookLeave[]; locale: string; myMemberId: string | null }) {
  if (!leaves.length) return null;
  const t = await getTranslations();
  const today = todayDhaka();
  const dayName = (d: string) =>
    d === today ? t("common.today") : d === addDays(today, 1) ? t("common.tomorrow") : fmtDate(locale, d, { weekday: "short", day: "numeric", month: "short" });

  return (
    <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
      <h2 className="mb-2 flex items-center gap-2 font-semibold">
        <ChefHat className="size-5" /> {t("leave.bannerTitle")}
      </h2>
      <ul className="space-y-2">
        {leaves.map((l) => {
          const cooks = l.offers.filter((o) => o.status === "approved");
          const mine = l.offers.find((o) => o.member_id === myMemberId);
          return (
            <li key={l.id} data-leave={`${l.date}:${l.meal}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/70 px-3 py-2 dark:bg-slate-900/50">
              <div className="text-sm">
                <b>{dayName(l.date)} · {t(`meal.${l.meal}`)}</b>
                {" - "}
                {cooks.length
                  ? t("leave.willCook", { names: cooks.map((c) => c.name).join(", ") })
                  : t("leave.mealOff")}
              </div>
              {!cooks.length && myMemberId && (
                mine?.status === "pending" ? (
                  <Badge tone="amber">{t("leave.waiting")}</Badge>
                ) : mine?.status === "rejected" ? (
                  <Badge tone="slate">{t("leave.notAccepted")}</Badge>
                ) : (
                  <ActionButton action={offerToCook.bind(null, l.id)} className={btn.small}>
                    {t("leave.illCook")}
                  </ActionButton>
                )
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
