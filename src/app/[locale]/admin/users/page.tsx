import { getTranslations, setRequestLocale } from "next-intl/server";
import { Users } from "lucide-react";
import { ActionButton } from "@/components/action-button";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { RowPanels } from "@/components/row-panels";
import { Avatar, Badge, btn, Card, PageTitle } from "@/components/ui";
import { adminResetPasswordForm, adminSetBlocked, adminSetSuperAdmin } from "@/lib/actions/admin";
import { requireUser } from "@/lib/mess";
import { createAdminClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/format";
import { displayLogin } from "@/lib/login-id";

type ProfileRow = { id: string; full_name: string; phone: string | null; is_super_admin: boolean; must_change_password: boolean };
type Membership = { user_id: string; role: string; status: string; mess: { name: string } | null };

export default async function AdminUsers({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { locale } = await params;
  const { q = "" } = await searchParams;
  setRequestLocale(locale);
  const { user: me } = await requireUser();
  const t = await getTranslations();

  // super admin page: read everything with the service role
  const admin = createAdminClient();
  const [{ data: list }, { data: profiles }, { data: memberships }] = await Promise.all([
    admin.auth.admin.listUsers({ perPage: 1000 }),
    admin.from("profiles").select("id, full_name, phone, is_super_admin, must_change_password"),
    admin.from("mess_members").select("user_id, role, status, mess:messes!mess_members_mess_id_fkey(name)").not("user_id", "is", null),
  ]);
  const prof = new Map(((profiles ?? []) as ProfileRow[]).map((p) => [p.id, p]));
  const mems = (memberships ?? []) as unknown as Membership[];
  const needle = q.trim().toLowerCase();
  const users = (list?.users ?? [])
    .map((u) => ({
      id: u.id,
      login: displayLogin(u.email),
      created: u.created_at,
      lastSignIn: u.last_sign_in_at,
      blocked: !!u.banned_until && Date.parse(u.banned_until) > Date.now(),
      profile: prof.get(u.id),
      messes: mems.filter((m) => m.user_id === u.id),
    }))
    .filter((u) => !needle || `${u.login} ${u.profile?.full_name ?? ""} ${u.profile?.phone ?? ""}`.toLowerCase().includes(needle))
    .sort((a, b) => (a.profile?.full_name ?? a.login).localeCompare(b.profile?.full_name ?? b.login));
  const d = (iso: string | null | undefined) =>
    iso ? fmtDate(locale, iso.slice(0, 10), { day: "numeric", month: "short", year: "numeric" }) : "-";

  return (
    <div className="space-y-5">
      <PageTitle sub={t("admin.usersSub")}>{t("admin.users")}</PageTitle>
      <form className="flex gap-2">
        <input name="q" defaultValue={q} placeholder={t("admin.search")} className="w-full max-w-sm rounded-xl border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900" />
        <button className={btn.secondary}>{t("admin.searchBtn")}</button>
      </form>

      <Card title={t("admin.userCount", { count: users.length })} icon={Users}>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {users.map((u) => (
            <li key={u.id} className="py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <Avatar name={u.profile?.full_name || u.login} />
                  <div className="min-w-0">
                    <div className="font-medium">
                      {u.profile?.full_name || "-"} {u.id === me.id && <span className="text-xs text-slate-500">({t("common.you")})</span>}
                    </div>
                    <div className="truncate text-sm text-slate-500">{[u.login, u.profile?.phone].filter(Boolean).join(" · ")}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {u.profile?.is_super_admin && <Badge tone="blue">{t("roles.superAdmin")}</Badge>}
                      {u.blocked && <Badge tone="red">{t("admin.blocked")}</Badge>}
                      {u.profile?.must_change_password && <Badge tone="amber">{t("admin.tempPassword")}</Badge>}
                      {u.messes.length === 0 && !u.profile?.is_super_admin && <Badge tone="amber">{t("admin.noMess")}</Badge>}
                      {u.messes.map((m, i) => (
                        <Badge key={i} tone={m.role === "manager" ? "green" : "slate"}>
                          {m.mess?.name} · {m.role === "manager" ? t("roles.manager") : t("roles.member")}
                        </Badge>
                      ))}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {t("admin.joined")}: {d(u.created)} · {t("admin.lastLogin")}: {d(u.lastSignIn)}
                    </div>
                  </div>
                </div>
                {u.id !== me.id && (
                  <div className="flex flex-wrap gap-2">
                    <ActionButton action={adminSetBlocked.bind(null, u.id, !u.blocked)} confirm={u.blocked ? undefined : t("admin.blockConfirm")} icon={u.blocked ? "unblock" : "block"}>
                      {u.blocked ? t("admin.unblock") : t("admin.block")}
                    </ActionButton>
                    <ActionButton
                      icon={u.profile?.is_super_admin ? "unshield" : "shield"}
                      action={adminSetSuperAdmin.bind(null, u.id, !u.profile?.is_super_admin)}
                      confirm={u.profile?.is_super_admin ? undefined : t("admin.makeSuperConfirm")}
                    >
                      {u.profile?.is_super_admin ? t("admin.removeSuper") : t("admin.makeSuper")}
                    </ActionButton>
                  </div>
                )}
              </div>
              {u.id !== me.id && (
                <RowPanels
                  panels={[{
                    key: "password", icon: "password", label: t("admin.resetPassword"),
                    content: (
                      <ActionForm action={adminResetPasswordForm} reset={false}>
                        <input type="hidden" name="id" value={u.id} />
                        <p className="text-sm text-slate-500">{t("admin.resetHelp")}</p>
                        <SubmitButton className={btn.secondary}>{t("admin.resetPassword")}</SubmitButton>
                      </ActionForm>
                    ),
                  }]}
                />
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
