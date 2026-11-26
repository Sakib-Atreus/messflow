import { headers } from "next/headers";
import { Link } from "@/i18n/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link2, MessageCircle, Phone, ReceiptText, UserCheck, Users } from "lucide-react";
import { ActionButton } from "@/components/action-button";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { CopyButton, WhatsAppButton } from "@/components/copy-button";
import { Avatar, Badge, btn, Card, Checkbox, cn, Field, inputClass, PageTitle } from "@/components/ui";
import { regenerateInvite } from "@/lib/actions/mess";
import { addMember, createMemberLogin, resetMemberPassword, reviewJoinRequest, setMemberBills, updateMember } from "@/lib/actions/people";
import { BillChoices, type BillOption } from "@/components/bill-choices";
import { RowPanels } from "@/components/row-panels";
import { Drawer } from "@/components/drawer";
import { CookCard } from "@/components/cook-card";
import { ListSearch } from "@/components/list-search";
import { createAdminClient } from "@/lib/supabase/server";
import { displayLogin, tempPassword } from "@/lib/login-id";
import { getContext } from "@/lib/mess";
import { monthStart, todayDhaka } from "@/lib/dates";
import { fmtDate, fmtMoney, fmtMonth, fmtNumber } from "@/lib/format";
import { getAvatars, getMembers, getMonthSummary } from "@/lib/queries";
import type { Member, MessRole } from "@/lib/types";

export default async function MembersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { supabase, mess, me, can, isManager } = await getContext();
  const canManage = can("members");
  const t = await getTranslations();
  const month = monthStart(todayDhaka());
  const [members, { data: roleRows }, { data: joinRows }, { data: billRows }, summary, logins, avatarRows] = await Promise.all([
    getMembers(supabase, mess.id),
    supabase.from("mess_roles").select("id, mess_id, name, permissions").eq("mess_id", mess.id).order("name"),
    canManage
      ? supabase.from("join_requests").select("id, display_name, created_at").eq("mess_id", mess.id).eq("status", "pending").order("created_at")
      : Promise.resolve({ data: [] as { id: string; display_name: string; created_at: string }[] }),
    can("costs")
      ? supabase
          .from("fixed_costs")
          .select("id, title, category, amount, fixed_cost_shares(member_id, amount)")
          .eq("mess_id", mess.id)
          .eq("month", month)
          .order("created_at")
      : Promise.resolve({ data: [] }),
    getMonthSummary(supabase, mess.id, month),
    // login names are only shown to people who manage members (service role reads auth emails)
    canManage
      ? createAdminClient()
          .auth.admin.listUsers({ perPage: 1000 })
          .then(({ data }) => new Map((data?.users ?? []).map((u) => [u.id, displayLogin(u.email)])))
      : Promise.resolve(new Map<string, string>()),
    supabase.from("mess_members").select("user_id").eq("mess_id", mess.id).not("user_id", "is", null).then(({ data }) => getAvatars(supabase, (data ?? []).map((r) => r.user_id))),
  ]);
  const photo = (m: Member) => (m.user_id ? avatarRows.get(m.user_id) ?? null : null);
  type BillRow = { id: string; title: string; category: string; amount: number; fixed_cost_shares: { member_id: string; amount: number }[] };
  const bills = (billRows ?? []) as BillRow[];
  /** this month's bills from one member's point of view (memberId null = someone not added yet) */
  const billsFor = (memberId: string | null): BillOption[] =>
    bills.map((b) => ({
      id: b.id,
      title: b.title,
      category: b.category,
      amount: Number(b.amount),
      current: Number(b.fixed_cost_shares.find((x) => x.member_id === memberId)?.amount ?? 0),
      otherPayers: b.fixed_cost_shares.filter((x) => x.member_id !== memberId && Number(x.amount) > 0).length,
    }));
  const roles = (roleRows ?? []) as MessRole[];
  const joins = joinRows ?? [];
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const joinUrl = (code: string) => `${origin}/${locale}/onboarding?code=${code}`;
  const active = members.filter((m) => m.status === "active");
  const left = members.filter((m) => m.status !== "active");
  const fmt = (d: string) => fmtDate(locale, d, { day: "numeric", month: "short", year: "numeric" });

  const roleValue = (m: Member) => (m.role === "manager" ? "manager" : (m.role_id ?? "member"));
  const roleName = (m: Member) =>
    m.role === "manager" ? t("roles.manager") : (roles.find((r) => r.id === m.role_id)?.name ?? t("roles.member"));
  const roleSelect = (value: string) => (
    <Field label={t("members.role")} hint={isManager ? undefined : t("members.roleManagerOnly")}>
      <select name="role" defaultValue={value} disabled={!isManager} className={inputClass}>
        <option value="member">{t("roles.member")}</option>
        {roles.map((r) => (
          <option key={r.id} value={r.id}>{r.name}</option>
        ))}
        <option value="manager">{t("roles.manager")}</option>
      </select>
    </Field>
  );

  const defaultsText = (m: Member) =>
    [m.default_breakfast && mess.breakfast_enabled && t("meal.breakfast"), m.default_lunch && t("meal.lunch"), m.default_dinner && t("meal.dinner")]
      .filter(Boolean)
      .join(", ") || "-";

  const loginFields = (suggested: string) => (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={t("members.login")} hint={t("members.loginHint")}>
        <input name="login" autoCapitalize="none" placeholder="karim" className={inputClass} />
      </Field>
      <Field label={t("members.tempPassword")} hint={t("members.tempPasswordHint")}>
        <input name="password" defaultValue={suggested} className={`${inputClass} font-mono`} />
      </Field>
    </div>
  );

  const money = (n: number) => fmtMoney(locale, n);
  const details = (m: Member) => {
    const row = summary.members.find((x) => x.member_id === m.id);
    const login = m.user_id ? logins.get(m.user_id) : null;
    const phoneDigits = (m.phone ?? "").replace(/\D/g, "");
    const wa = phoneDigits.startsWith("880") ? phoneDigits : phoneDigits.startsWith("0") ? `88${phoneDigits}` : phoneDigits;
    const owes = (row?.balance ?? 0) < -0.004;
    const info: [string, React.ReactNode][] = [
      [t("common.phone"), m.phone ? <a href={`tel:${m.phone}`} className="font-medium text-brand-700 hover:underline dark:text-brand-400">{m.phone}</a> : "-"],
      [t("common.room"), m.room || "-"],
      [t("members.role"), roleName(m)],
      [t("members.loginLabel"), m.user_id ? (login ?? t("members.hasAccount")) : <span className="text-amber-700 dark:text-amber-400">{t("members.noAccount")}</span>],
      [t("members.joinedOn"), fmt(m.joined_on)],
      ...(m.left_on ? [[t("members.leftOn"), fmt(m.left_on)] as [string, React.ReactNode]] : []),
      [t("members.defaults"), defaultsText(m)],
    ];
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <Avatar name={m.display_name} src={photo(m)} className="size-14 text-lg" />
          <div>
            <div className="text-lg font-bold">{m.display_name}</div>
            <div className="flex flex-wrap gap-1">
              <Badge tone={m.role === "manager" ? "blue" : m.role_id ? "green" : "slate"}>{roleName(m)}</Badge>
              {m.status !== "active" && <Badge tone="red">{t("members.left")}</Badge>}
            </div>
          </div>
        </div>

        {row && (
          <div
            className={cn(
              "flex items-center justify-between gap-3 rounded-xl border px-4 py-3",
              Math.abs(row.balance) < 0.005
                ? "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50"
                : owes
                  ? "border-red-200 bg-red-50/60 dark:border-red-900/60 dark:bg-red-950/30"
                  : "border-brand-200 bg-brand-50/60 dark:border-brand-900/60 dark:bg-brand-950/30",
            )}
          >
            <div className="leading-tight">
              <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
                {Math.abs(row.balance) < 0.005 ? t("person.settled") : owes ? t("person.due") : t("person.getsBack")}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">{fmtMonth(locale, month)}</div>
            </div>
            <div
              className={cn(
                "text-2xl font-semibold tabular-nums",
                Math.abs(row.balance) < 0.005
                  ? "text-slate-700 dark:text-slate-200"
                  : owes
                    ? "text-red-600 dark:text-red-400"
                    : "text-brand-700 dark:text-brand-400",
              )}
            >
              {money(Math.abs(row.balance))}
            </div>
          </div>
        )}

        <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm dark:divide-slate-800 dark:border-slate-700">
          {info.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <dt className="text-slate-500 dark:text-slate-400">{k}</dt>
              <dd className="text-right font-medium">{v}</dd>
            </div>
          ))}
        </dl>

        {row && (
          <div>
            <div className="mb-2 text-sm font-semibold">{t("members.thisMonth", { month: fmtMonth(locale, month) })}</div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {([
                [t("nav.meals"), fmtNumber(locale, row.meals)],
                [t("sheet.colMeal"), money(row.meal_cost)],
                [t("sheet.colBills"), money(row.fixed_share)],
                [t("person.paid"), money(row.deposits)],
                ...(Math.abs(row.carry_in) > 0.004 ? [[t("person.previous"), money(row.carry_in)]] : []),
              ] as [string, string][]).map(([k, v]) => (
                <div key={k} className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
                  <div className="text-xs text-slate-500">{k}</div>
                  <div className="font-semibold tabular-nums">{v}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Link href={`/members/${m.id}`} className={btn.primary}>
            <ReceiptText className="size-4" /> {t("members.fullBill")}
          </Link>
          {m.phone && (
            <>
              <a href={`tel:${m.phone}`} className={btn.secondary}>
                <Phone className="size-4" /> {t("members.call")}
              </a>
              <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className={btn.secondary}>
                <MessageCircle className="size-4" /> WhatsApp
              </a>
            </>
          )}
        </div>
      </div>
    );
  };

  const memberRow = (m: Member) => (
    <li key={m.id} data-search={`${m.display_name} ${m.room ?? ""} ${m.phone ?? ""} ${roleName(m)}`} className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={m.display_name} src={photo(m)} />
          <div className="min-w-0">
            <div className="font-medium">
              <Link href={`/members/${m.id}`} className="inline-flex min-h-8 items-center underline-offset-2 hover:text-brand-700 hover:underline dark:hover:text-brand-400">
                {m.display_name}
              </Link>
              {m.id === me.id && <span className="text-xs text-slate-500"> ({t("common.you")})</span>}
            </div>
            <div className="text-sm text-slate-500">
              {[m.room, m.phone, `${t("members.defaults")}: ${defaultsText(m)}`].filter(Boolean).join(" · ")}
            </div>
            <div className="text-xs text-slate-500">
              {t("members.joinedOn")}: {fmt(m.joined_on)}
              {m.left_on && ` · ${t("members.leftOn")}: ${fmt(m.left_on)}`}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={m.role === "manager" ? "blue" : m.role_id ? "green" : "slate"}>{roleName(m)}</Badge>
          {m.status !== "active" && <Badge tone="red">{t("members.left")}</Badge>}
          {!m.user_id && <Badge tone="amber">{t("members.noAccount")}</Badge>}
          <Drawer label={t("members.details")} title={m.display_name} icon="details" className={btn.small}>
            {details(m)}
          </Drawer>
        </div>
      </div>

      <RowPanels
        panels={[
          ...(canManage && !m.user_id && m.status === "active"
            ? [{
                key: "login", icon: "login" as const, highlight: true, label: t("members.giveLogin"),
                content: (
                  <>
                    <ActionForm action={createMemberLogin} reset={false}>
                      <input type="hidden" name="id" value={m.id} />
                      {loginFields(tempPassword())}
                      <SubmitButton>{t("members.createLogin")}</SubmitButton>
                    </ActionForm>
                    {m.claim_code && (
                      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3 text-sm dark:border-slate-700">
                        <span>{t("members.claimHelp", { name: m.display_name })}</span>
                        <code className="rounded bg-white px-2 py-0.5 font-mono tracking-widest dark:bg-slate-900">{m.claim_code}</code>
                        <CopyButton text={m.claim_code} />
                        <WhatsAppButton
                          label={t("common.share")}
                          text={t("members.inviteMessage", { mess: mess.name, url: joinUrl(m.claim_code), code: m.claim_code })}
                        />
                      </div>
                    )}
                  </>
                ),
              }]
            : []),
          ...(can("costs") && bills.length > 0 && m.status === "active"
            ? [{
                key: "bills", icon: "bills" as const,
                label: `${t("bills.short")} · ${fmtMoney(locale, billsFor(m.id).reduce((a, b) => a + b.current, 0))}`,
                content: (
                  <ActionForm action={setMemberBills} reset={false}>
                    <input type="hidden" name="member_id" value={m.id} />
                    <p className="text-xs text-slate-500">
                      {t("bills.title", { month: fmtMonth(locale, month) })} - {t("bills.help")}
                    </p>
                    <BillChoices bills={billsFor(m.id)} isNew={false} />
                    <SubmitButton>{t("common.save")}</SubmitButton>
                  </ActionForm>
                ),
              }]
            : []),
          ...(isManager && m.user_id && m.user_id !== me.user_id && m.role !== "manager"
            ? [{
                key: "password", icon: "password" as const, label: t("admin.resetPassword"),
                content: (
                  <ActionForm action={resetMemberPassword} reset={false}>
                    <input type="hidden" name="id" value={m.id} />
                    <p className="text-sm text-slate-500">{t("members.resetHelp", { name: m.display_name })}</p>
                    <Field label={t("members.tempPassword")} hint={t("members.tempPasswordHint")}>
                      <input name="password" defaultValue={tempPassword()} className={`${inputClass} font-mono`} />
                    </Field>
                    <SubmitButton className={btn.secondary}>{t("admin.resetPassword")}</SubmitButton>
                  </ActionForm>
                ),
              }]
            : []),
          ...(canManage
            ? [{
                key: "edit", icon: "edit" as const, label: t("common.edit"),
                content: (
                  <ActionForm action={updateMember} reset={false}>
                    <input type="hidden" name="id" value={m.id} />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label={t("common.name")}>
                        <input name="display_name" defaultValue={m.display_name} required className={inputClass} />
                      </Field>
                      <Field label={t("common.phone")}>
                        <input name="phone" type="tel" defaultValue={m.phone ?? ""} className={inputClass} />
                      </Field>
                      <Field label={t("common.room")}>
                        <input name="room" defaultValue={m.room ?? ""} className={inputClass} />
                      </Field>
                      {roleSelect(roleValue(m))}
                      <Field label={t("members.leftOn")} hint={t("members.leftHelp")}>
                        <input name="left_on" type="date" defaultValue={m.left_on ?? ""} className={inputClass} />
                      </Field>
                    </div>
                    <div className="flex flex-wrap gap-4">
                      {mess.breakfast_enabled && <Checkbox name="default_breakfast" label={t("meal.breakfast")} defaultChecked={m.default_breakfast} />}
                      <Checkbox name="default_lunch" label={t("meal.lunch")} defaultChecked={m.default_lunch} />
                      <Checkbox name="default_dinner" label={t("meal.dinner")} defaultChecked={m.default_dinner} />
                    </div>
                    <SubmitButton>{t("common.save")}</SubmitButton>
                  </ActionForm>
                ),
              }]
            : []),
        ]}
      />
    </li>
  );

  const addForm = (
          <ActionForm action={addMember}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("common.name")}>
                <input name="display_name" required className={inputClass} />
              </Field>
              <Field label={`${t("common.phone")} (${t("common.optional")})`}>
                <input name="phone" type="tel" className={inputClass} />
              </Field>
              <Field label={`${t("common.room")} (${t("common.optional")})`}>
                <input name="room" className={inputClass} />
              </Field>
              <Field label={t("members.joinedOn")}>
                <input name="joined_on" type="date" defaultValue={todayDhaka()} required className={inputClass} />
              </Field>
              {roleSelect("member")}
            </div>
            <div className="flex flex-wrap gap-4">
              {mess.breakfast_enabled && <Checkbox name="default_breakfast" label={t("meal.breakfast")} defaultChecked={mess.new_member_breakfast} />}
              <Checkbox name="default_lunch" label={t("meal.lunch")} defaultChecked={mess.new_member_lunch} />
              <Checkbox name="default_dinner" label={t("meal.dinner")} defaultChecked={mess.new_member_dinner} />
            </div>
            {can("costs") && bills.length > 0 && (
              <div className="rounded-xl border border-dashed border-slate-300 p-3 dark:border-slate-700">
                <div className="text-sm font-medium">{t("bills.newTitle", { month: fmtMonth(locale, month) })}</div>
                <p className="mb-2 text-xs text-slate-500">{t("bills.newHelp")}</p>
                <BillChoices bills={billsFor(null)} isNew />
              </div>
            )}
            <div className="rounded-xl border border-dashed border-slate-300 p-3 dark:border-slate-700">
              <div className="mb-2 text-sm font-medium">{t("members.loginOptional")}</div>
              {loginFields(tempPassword())}
            </div>
            <SubmitButton>{t("common.add")}</SubmitButton>
          </ActionForm>
  );

  return (
    <div className="space-y-5">
      <PageTitle
        sub={t("members.subtitle", { count: active.length })}
        action={
          canManage && (
            <Drawer label={t("members.add")} title={t("members.add")} icon="add">
              {addForm}
            </Drawer>
          )
        }
      >
        {t("members.title")}
      </PageTitle>

      {canManage && joins.length > 0 && (
        <Card title={t("members.joinRequests", { count: joins.length })} icon={UserCheck} className="border-amber-300 dark:border-amber-800">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {joins.map((j) => (
              <li key={j.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="flex items-center gap-3">
                  <Avatar name={j.display_name} />
                  <div>
                    <div className="font-medium">{j.display_name}</div>
                    <div className="text-xs text-slate-500">{fmt(j.created_at.slice(0, 10))}</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <ActionButton action={reviewJoinRequest.bind(null, j.id, true)} className={btn.approve} icon="approve">
                    {t("common.approve")}
                  </ActionButton>
                  <ActionButton action={reviewJoinRequest.bind(null, j.id, false)} confirm={t("common.rejectConfirm")} className={btn.danger} icon="reject">
                    {t("common.reject")}
                  </ActionButton>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title={t("members.title")} icon={Users}>
        <ListSearch placeholder={t("members.search")}>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">{active.map(memberRow)}</ul>
        </ListSearch>
        {left.length > 0 && (
          <details className="mt-3">
            <summary className="mf-sum text-slate-600 dark:text-slate-300">
              {t("members.left")} ({left.length})
            </summary>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">{left.map(memberRow)}</ul>
          </details>
        )}
      </Card>

      {isManager && <CookCard supabase={supabase} messId={mess.id} />}

      {can("settings") && (
        <Card title={t("members.inviteTitle")} icon={Link2}>
          <p className="mb-3 text-sm text-slate-500">{t("members.inviteHelp")}</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded-lg bg-slate-100 px-3 py-1.5 font-mono text-lg tracking-widest dark:bg-slate-800">
              {mess.invite_code}
            </code>
            <CopyButton text={mess.invite_code} />
            <WhatsAppButton
              label={t("common.share")}
              text={t("members.inviteMessage", { mess: mess.name, url: joinUrl(mess.invite_code), code: mess.invite_code })}
            />
            <ActionButton action={regenerateInvite} icon="refresh" confirm={t("members.regenerateConfirm")}>{t("members.regenerate")}</ActionButton>
          </div>
        </Card>
      )}
    </div>
  );
}
