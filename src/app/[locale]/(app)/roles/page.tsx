import { getTranslations, setRequestLocale } from "next-intl/server";
import { KeyRound, Plus } from "lucide-react";
import { redirect } from "@/i18n/navigation";
import { ActionButton } from "@/components/action-button";
import { Badge, btn, Card, Empty, PageTitle } from "@/components/ui";
import { deleteRole } from "@/lib/actions/people";
import { RoleForm } from "@/components/role-creator";
import { RowPanels } from "@/components/row-panels";
import { getContext } from "@/lib/mess";
import { getMembers } from "@/lib/queries";
import type { MessRole } from "@/lib/types";

export default async function RolesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { supabase, mess, isManager } = await getContext();
  if (!isManager) redirect({ href: "/dashboard", locale });
  const t = await getTranslations();
  const [{ data }, members] = await Promise.all([
    supabase.from("mess_roles").select("id, mess_id, name, permissions").eq("mess_id", mess.id).order("name"),
    getMembers(supabase, mess.id),
  ]);
  const roles = (data ?? []) as MessRole[];
  const holders = (id: string) => members.filter((m) => m.role_id === id && m.status === "active").map((m) => m.display_name);

  return (
    <div className="space-y-5">
      <PageTitle sub={t("roles.subtitle")}>{t("nav.roles")}</PageTitle>

      {roles.length === 0 && (
        <Card>
          <Empty icon={KeyRound}>{t("roles.empty")}</Empty>
        </Card>
      )}

      {roles.map((r) => {
        const who = holders(r.id);
        return (
          <Card key={r.id} title={r.name} icon={KeyRound}>
            <div className="mb-3 flex flex-wrap gap-1">
              {r.permissions.length === 0 ? (
                <Badge>{t("roles.noPerms")}</Badge>
              ) : (
                r.permissions.map((p) => (
                  <Badge key={p} tone="green">{t(`perms.${p}`)}</Badge>
                ))
              )}
            </div>
            <p className="text-sm text-slate-500">
              {t("roles.holders")}: {who.length ? who.join(", ") : "-"}
            </p>
            <div className="mt-3 flex flex-wrap items-start gap-2">
              <div className="min-w-0 flex-1">
                <RowPanels
                  panels={[{ key: "edit", icon: "edit", label: t("common.edit"), content: <RoleForm id={r.id} name={r.name} permissions={r.permissions} /> }]}
                />
              </div>
              <ActionButton action={deleteRole.bind(null, r.id)} confirm={t("roles.deleteConfirm")} className={`${btn.danger} mt-2`} icon="delete">
                {t("common.delete")}
              </ActionButton>
            </div>
          </Card>
        );
      })}

      <Card title={t("roles.create")} icon={Plus}>
        <p className="mb-3 text-sm text-slate-500">{t("roles.createHelp")}</p>
        <RoleForm />
      </Card>
    </div>
  );
}
