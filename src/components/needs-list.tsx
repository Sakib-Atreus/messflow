import { getTranslations } from "next-intl/server";
import { ShoppingBasket } from "lucide-react";
import { ActionButton } from "@/components/action-button";
import { btn, Card } from "@/components/ui";
import { markNeedBought } from "@/lib/actions/needs";
import { needEmoji } from "@/lib/needs";
import type { getContext } from "@/lib/mess";
import { fmtNumber } from "@/lib/format";

type Supa = Awaited<ReturnType<typeof getContext>>["supabase"];
type Need = { id: string; item: string | null; note: string | null; voice_path: string | null; created_at: string };

/**
 * "বাজারে লাগবে": what khala asked for that nobody has bought yet, with voice messages.
 * Bazar page: everyone sees it with a "Bought" tick. Kitchen page (`forCook`): khala sees what she
 * sent, read-only and in bigger text; each line disappears once someone ticks it.
 */
export async function NeedsList({ supabase, messId, locale, forCook = false }: { supabase: Supa; messId: string; locale: string; forCook?: boolean }) {
  const { data } = await supabase
    .from("bazar_needs")
    .select("id, item, note, voice_path, created_at")
    .eq("mess_id", messId)
    .eq("status", "open")
    .order("created_at", { ascending: false });
  const needs = (data ?? []) as Need[];
  if (!needs.length) return null;
  const t = await getTranslations();
  const paths = needs.map((n) => n.voice_path).filter((p): p is string => !!p);
  const { data: signed } = paths.length ? await supabase.storage.from("voice").createSignedUrls(paths, 60 * 60) : { data: [] };
  const urlOf = new Map((signed ?? []).filter((s) => s.path && s.signedUrl).map((s) => [s.path as string, s.signedUrl as string]));
  const when = (iso: string) =>
    new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Dhaka" }).format(new Date(iso));

  const rows = (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {needs.map((n) => (
        <li key={n.id} data-need-row={n.item ?? "note"} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
          <span className={forCook ? "text-3xl leading-none" : "text-2xl leading-none"} aria-hidden>
            {n.item ? needEmoji(n.item) : n.voice_path && !n.note ? "🎤" : "📝"}
          </span>
          <div className="min-w-0 flex-1">
            <div className={forCook ? "text-lg font-semibold" : "font-medium"}>
              {n.item ? t(`needs.items.${n.item}` as "needs.items.oil") : n.note ?? t("needs.voiceNote")}
            </div>
            {n.voice_path && urlOf.get(n.voice_path) && (
              <audio src={urlOf.get(n.voice_path)} controls preload="none" className="mt-1 h-10 w-full max-w-xs" />
            )}
            <div className="text-xs text-slate-500" suppressHydrationWarning>{when(n.created_at)}</div>
          </div>
          {forCook ? (
            <span className="text-xl" aria-label={t("needs.sentAlready")}>⏳</span>
          ) : (
            <ActionButton action={markNeedBought.bind(null, n.id)} className={btn.approve} icon="approve">
              {t("needs.bought")}
            </ActionButton>
          )}
        </li>
      ))}
    </ul>
  );

  if (forCook) {
    return (
      <section data-waiting className="rounded-3xl border border-amber-300 bg-white p-5 shadow-sm dark:border-amber-800 dark:bg-slate-900">
        <h2 className="text-xl font-semibold">⏳ {t("needs.waitingTitle")} ({fmtNumber(locale, needs.length)})</h2>
        <p className="mt-1 text-base text-slate-500">{t("needs.waitingHelp")}</p>
        <div className="mt-2">{rows}</div>
      </section>
    );
  }

  return (
    <Card title={`${t("needs.listTitle")} (${fmtNumber(locale, needs.length)})`} icon={ShoppingBasket} className="border-amber-300 dark:border-amber-800">
      <p className="-mt-1 mb-3 text-sm text-slate-500">{t("needs.listHelp")}</p>
      {rows}
      {paths.length > 0 && <p className="mt-2 text-xs text-slate-400">{t("needs.voiceExpires")}</p>}
    </Card>
  );
}
