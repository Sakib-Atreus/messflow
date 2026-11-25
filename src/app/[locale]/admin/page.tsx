import { getTranslations, setRequestLocale } from "next-intl/server";
import { Building2, Inbox, ShoppingCart, UserCheck, Users, UtensilsCrossed } from "lucide-react";
import { ActionButton } from "@/components/action-button";
import { Avatar, btn, Card, Empty, PageTitle, Stat } from "@/components/ui";
import { reviewMessRequest } from "@/lib/actions/admin";
import { requireUser } from "@/lib/mess";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDate, fmtMoney, fmtNumber } from "@/lib/format";
import { displayLogin } from "@/lib/login-id";

type Stats = { messes: number; users: number; members: number; mess_requests: number; join_requests: number; meals_today: number; bazar_month: number };

export default async function AdminHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { supabase, profile } = await requireUser();
  const t = await getTranslations();

  const [{ data: stats }, { data: reqs }, { data: messes }] = await Promise.all([
    supabase.rpc("platform_stats"),
    supabase
      .from("mess_requests")
      .select("id, name, address, display_name, user_id, created_at")
      .eq("status", "pending")
      .order("created_at"),
    supabase.from("messes").select("id, name, address, created_at").order("created_at", { ascending: false }).limit(5),
  ]);
  const s = (stats ?? {}) as Stats;
  // requester emails live in auth.users → service role, only for the listed requests
  const admin = createAdminClient();
  const emails = new Map<string, string>();
  await Promise.all(
    (reqs ?? []).map(async (r) => {
      const { data } = await admin.auth.admin.getUserById(r.user_id);
      if (data.user?.email) emails.set(r.user_id, displayLogin(data.user.email));
    }),
  );
  const d = (iso: string) => fmtDate(locale, iso.slice(0, 10), { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="space-y-5">
      <PageTitle sub={t("admin.overviewSub")}>{t("dashboard.hello", { name: profile?.full_name || "Admin" })}</PageTitle>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t("admin.messes")} value={fmtNumber(locale, s.messes ?? 0)} icon={Building2} />
        <Stat label={t("admin.users")} value={fmtNumber(locale, s.users ?? 0)} icon={Users} hint={t("admin.activeMembers", { count: s.members ?? 0 })} />
        <Stat label={t("admin.mealsToday")} value={fmtNumber(locale, s.meals_today ?? 0)} icon={UtensilsCrossed} />
        <Stat label={t("admin.bazarMonth")} value={fmtMoney(locale, s.bazar_month ?? 0)} icon={ShoppingCart} />
      </div>

      <Card title={t("admin.messRequests", { count: reqs?.length ?? 0 })} icon={Inbox}
        className={reqs?.length ? "border-amber-300 dark:border-amber-800" : undefined}>
        {!reqs?.length ? (
          <Empty>{t("admin.noRequests")}</Empty>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {reqs.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="flex items-center gap-3">
                  <Avatar name={r.display_name} />
                  <div>
                    <div className="font-medium">{r.name}</div>
                    <div className="text-sm text-slate-500">
                      {[r.display_name, emails.get(r.user_id), r.address].filter(Boolean).join(" · ")}
                    </div>
                    <div className="text-xs text-slate-500">{d(r.created_at)}</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <ActionButton action={reviewMessRequest.bind(null, r.id, true)} className={btn.approve} icon="approve">
                    {t("common.approve")}
                  </ActionButton>
                  <ActionButton action={reviewMessRequest.bind(null, r.id, false)} confirm={t("common.rejectConfirm")} className={btn.danger} icon="reject">
                    {t("common.reject")}
                  </ActionButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {(s.join_requests ?? 0) > 0 && (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <UserCheck className="size-4" /> {t("admin.joinWaiting", { count: s.join_requests })}
        </p>
      )}

      <Card title={t("admin.recentMesses")} icon={Building2}>
        {!messes?.length ? (
          <Empty>{t("admin.noMesses")}</Empty>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {messes.map((m) => (
              <li key={m.id} className="flex justify-between gap-2 py-2">
                <span className="font-medium">{m.name}</span>
                <span className="text-sm text-slate-500">{d(m.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
