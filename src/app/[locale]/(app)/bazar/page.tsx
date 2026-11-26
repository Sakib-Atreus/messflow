import { getTranslations, setRequestLocale } from "next-intl/server";
import { ActionButton } from "@/components/action-button";
import { ListSearch } from "@/components/list-search";
import { deleteWithUndo } from "@/lib/actions/undo";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { MonthNav, parseMonth } from "@/components/month-nav";
import { btn, Card, Empty, Field, inputClass, PageTitle, Stat } from "@/components/ui";
import { addBazar } from "@/lib/actions/mess";
import { getContext } from "@/lib/mess";
import { NeedsList } from "@/components/needs-list";
import { monthEnd, todayDhaka } from "@/lib/dates";
import { fmtDate, fmtMoney } from "@/lib/format";
import { getMembers } from "@/lib/queries";

type Entry = { id: string; date: string; amount: number; items: string | null; shopper_id: string | null };

export default async function BazarPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { supabase, mess, me, can } = await getContext();
  const isStaff = can("bazar");
  const t = await getTranslations();
  const today = todayDhaka();
  const month = parseMonth((await searchParams).month, today);

  const [members, { data }] = await Promise.all([
    getMembers(supabase, mess.id),
    supabase
      .from("bazar_entries")
      .select("id, date, amount, items, shopper_id")
      .eq("mess_id", mess.id)
      .gte("date", month)
      .lte("date", monthEnd(month))
      .order("date", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);
  const entries = (data ?? []) as Entry[];
  const total = entries.reduce((a, e) => a + Number(e.amount), 0);
  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.display_name ?? "-";

  return (
    <div className="space-y-5">
      <PageTitle action={<MonthNav path="/bazar" month={month} />}>{t("bazar.title")}</PageTitle>
      <Stat label={`${t("common.total")} · ${t("bazar.thisMonth")}`} value={fmtMoney(locale, total)} />

      <NeedsList supabase={supabase} messId={mess.id} locale={locale} />

      {isStaff && (
        <Card title={t("bazar.add")}>
          <ActionForm action={addBazar}>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={t("common.date")}>
                <input type="date" name="date" defaultValue={today} required className={inputClass} />
              </Field>
              <Field label={t("common.amount")}>
                <input type="number" name="amount" inputMode="decimal" step="0.01" min="0.01" required className={inputClass} />
              </Field>
              <Field label={t("bazar.shopper")}>
                <select name="shopper_id" defaultValue={me.id} className={inputClass}>
                  {members.filter((m) => m.status === "active").map((m) => (
                    <option key={m.id} value={m.id}>{m.display_name}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label={`${t("bazar.items")} (${t("common.optional")})`}>
              <input name="items" placeholder={t("bazar.itemsPlaceholder")} className={inputClass} />
            </Field>
            <SubmitButton>{t("common.add")}</SubmitButton>
          </ActionForm>
        </Card>
      )}

      <Card>
        {entries.length === 0 ? (
          <Empty>{t("common.none")}</Empty>
        ) : (
          <ListSearch placeholder={t("bazar.search")}>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {entries.map((e) => (
              <li
                key={e.id}
                data-search={`${nameOf(e.shopper_id)} ${e.items ?? ""} ${e.amount} ${fmtDate(locale, e.date)}`}
                className="flex items-start justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <div className="font-medium">
                    {fmtDate(locale, e.date)} · {nameOf(e.shopper_id)}
                  </div>
                  {e.items && <div className="truncate text-sm text-slate-500">{e.items}</div>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="font-semibold tabular-nums">{fmtMoney(locale, e.amount)}</span>
                  {isStaff && (
                    <ActionButton action={deleteWithUndo.bind(null, "bazar", e.id)} className={btn.danger} icon="delete">
                      {t("common.delete")}
                    </ActionButton>
                  )}
                </div>
              </li>
            ))}
          </ul>
          </ListSearch>
        )}
      </Card>
    </div>
  );
}
