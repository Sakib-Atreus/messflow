import { getTranslations, setRequestLocale } from "next-intl/server";
import { ActionButton } from "@/components/action-button";
import { ListSearch } from "@/components/list-search";
import { deleteWithUndo } from "@/lib/actions/undo";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { MonthNav, parseMonth } from "@/components/month-nav";
import { Badge, btn, Card, Empty, Field, inputClass, PageTitle } from "@/components/ui";
import { addDeposit, reviewDeposit } from "@/lib/actions/mess";
import { getContext } from "@/lib/mess";
import { monthEnd, todayDhaka } from "@/lib/dates";
import { fmtDate, fmtMoney } from "@/lib/format";
import { getMembers } from "@/lib/queries";
import type { DepositStatus, PaymentMethod } from "@/lib/types";

type Deposit = {
  id: string;
  member_id: string;
  date: string;
  amount: number;
  method: PaymentMethod;
  txn_id: string | null;
  note: string | null;
  status: DepositStatus;
  created_by: string | null;
};

const METHODS: PaymentMethod[] = ["cash", "bkash", "nagad", "rocket", "bank", "other"];
const tone = { pending: "amber", approved: "green", rejected: "red" } as const;

export default async function DepositsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { supabase, mess, me, user, can } = await getContext();
  const isStaff = can("deposits");
  const isManager = can("deposits");
  const t = await getTranslations();
  const today = todayDhaka();
  const month = parseMonth((await searchParams).month, today);

  const cols = "id, member_id, date, amount, method, txn_id, note, status, created_by";
  const [members, { data }, { data: pendingData }] = await Promise.all([
    getMembers(supabase, mess.id),
    supabase.from("deposits").select(cols).eq("mess_id", mess.id).gte("date", month).lte("date", monthEnd(month))
      .order("date", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("deposits").select(cols).eq("mess_id", mess.id).eq("status", "pending").order("created_at"),
  ]);
  const deposits = (data ?? []) as Deposit[];
  const pending = (pendingData ?? []) as Deposit[];
  const nameOf = (id: string) => members.find((m) => m.id === id)?.display_name ?? "-";
  const approvedTotal = deposits.filter((d) => d.status === "approved").reduce((a, d) => a + Number(d.amount), 0);

  const row = (d: Deposit, actions: boolean) => (
    <li key={d.id} data-search={`${nameOf(d.member_id)} ${d.amount} ${t(`methods.${d.method}`)} ${d.txn_id ?? ""} ${d.note ?? ""} ${t(`deposits.status.${d.status}`)} ${fmtDate(locale, d.date)}`} className="py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-medium">{nameOf(d.member_id)}</div>
          <div className="text-sm text-slate-500">
            {fmtDate(locale, d.date)} · {t(`methods.${d.method}`)}
            {d.txn_id && ` · ${d.txn_id}`}
          </div>
          {d.note && <div className="text-sm text-slate-500">{d.note}</div>}
        </div>
        <div className="shrink-0 text-right">
          <div className="font-semibold tabular-nums">{fmtMoney(locale, d.amount)}</div>
          <div className="mt-0.5 flex items-center justify-end gap-1">
            <Badge tone={tone[d.status]}>{t(`deposits.status.${d.status}`)}</Badge>
            {!actions && (isManager || (d.status === "pending" && d.created_by === user.id)) && (
              <ActionButton action={deleteWithUndo.bind(null, "deposit", d.id)} className={btn.icon} icon="delete" iconOnly>
                {t("common.delete")}
              </ActionButton>
            )}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-2 empty:hidden [&:not(:empty)]:mt-2">
        {actions && isStaff && d.status === "pending" && (
          <>
            <ActionButton action={reviewDeposit.bind(null, d.id, "approved")} className={btn.approve} icon="approve">
              {t("deposits.approve")}
            </ActionButton>
            <ActionButton action={reviewDeposit.bind(null, d.id, "rejected")} className={btn.danger} icon="reject">
              {t("deposits.reject")}
            </ActionButton>
          </>
        )}
      </div>
    </li>
  );

  return (
    <div className="space-y-5">
      <PageTitle action={<MonthNav path="/deposits" month={month} />}>{t("deposits.title")}</PageTitle>

      {isStaff && pending.length > 0 && (
        <Card title={t("deposits.pendingTitle")} className="border-amber-300 dark:border-amber-800">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">{pending.map((d) => row(d, true))}</ul>
        </Card>
      )}

      <Card title={isStaff ? t("deposits.add") : t("deposits.submit")}>
        {!isStaff && <p className="mb-3 text-sm text-slate-500">{t("deposits.memberHelp")}</p>}
        <ActionForm action={addDeposit}>
          <div className="grid gap-3 sm:grid-cols-3">
            {isStaff && (
              <Field label={t("common.member")}>
                <select name="member_id" required className={inputClass}>
                  {members.filter((m) => m.status === "active").map((m) => (
                    <option key={m.id} value={m.id}>{m.display_name}</option>
                  ))}
                </select>
              </Field>
            )}
            <Field label={t("common.amount")}>
              <input type="number" name="amount" inputMode="decimal" step="0.01" min="0.01" required className={inputClass} />
            </Field>
            <Field label={t("deposits.method")}>
              <select name="method" defaultValue="cash" className={inputClass}>
                {METHODS.map((m) => (
                  <option key={m} value={m}>{t(`methods.${m}`)}</option>
                ))}
              </select>
            </Field>
            <Field label={`${t("deposits.txnId")} (${t("common.optional")})`}>
              <input name="txn_id" className={inputClass} />
            </Field>
            <Field label={t("common.date")}>
              <input type="date" name="date" defaultValue={today} required className={inputClass} />
            </Field>
            <Field label={`${t("common.note")} (${t("common.optional")})`}>
              <input name="note" className={inputClass} />
            </Field>
          </div>
          <SubmitButton>{isStaff ? t("common.add") : t("deposits.submit")}</SubmitButton>
        </ActionForm>
      </Card>

      <Card title={`${t("common.total")}: ${fmtMoney(locale, approvedTotal)}`}>
        {deposits.length === 0 ? (
          <Empty>{t("common.none")}</Empty>
        ) : (
          <ListSearch placeholder={t("deposits.search")}>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {deposits.filter((d) => isStaff || d.member_id === me.id || d.status === "approved").map((d) => row(d, false))}
          </ul>
          </ListSearch>
        )}
      </Card>
    </div>
  );
}
