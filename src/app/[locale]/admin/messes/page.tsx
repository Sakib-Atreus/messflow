import { getTranslations, setRequestLocale } from "next-intl/server";
import { Building2, Plus } from "lucide-react";
import { ActionButton } from "@/components/action-button";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, btn, Card, Empty, Field, inputClass, PageTitle } from "@/components/ui";
import { adminDeleteMess, createMessWithManager, openMess } from "@/lib/actions/admin";
import { requireUser } from "@/lib/mess";
import { fmtDate, fmtNumber } from "@/lib/format";
import { tempPassword } from "@/lib/login-id";

type Row = {
  id: string;
  name: string;
  address: string | null;
  created_at: string;
  mess_members: { display_name: string; role: string; status: string }[];
};

export default async function AdminMesses({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { supabase } = await requireUser();
  const t = await getTranslations();
  const { data } = await supabase
    .from("messes")
    .select("id, name, address, created_at, mess_members!mess_members_mess_id_fkey(display_name, role, status)")
    .order("name");
  const messes = (data ?? []) as Row[];

  return (
    <div className="space-y-5">
      <PageTitle sub={t("admin.messesSub")}>{t("admin.messes")}</PageTitle>

      <Card title={t("admin.allMesses", { count: messes.length })} icon={Building2}>
        {messes.length === 0 ? (
          <Empty>{t("admin.noMesses")}</Empty>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {messes.map((m) => {
              const active = m.mess_members.filter((x) => x.status === "active");
              const managers = active.filter((x) => x.role === "manager").map((x) => x.display_name);
              return (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <div className="font-medium">{m.name}</div>
                    <div className="text-sm text-slate-500">
                      {[m.address, `${t("roles.manager")}: ${managers.join(", ") || "-"}`].filter(Boolean).join(" · ")}
                    </div>
                    <div className="mt-1 flex gap-1">
                      <Badge>{t("admin.memberCount", { count: active.length })}</Badge>
                      <Badge tone="slate">{fmtDate(locale, m.created_at.slice(0, 10), { day: "numeric", month: "short", year: "numeric" })}</Badge>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <ActionButton action={openMess.bind(null, m.id)} className={btn.approve} icon="open">
                      {t("admin.open")}
                    </ActionButton>
                    <ActionButton action={adminDeleteMess.bind(null, m.id)} confirm={t("admin.deleteMessConfirm", { name: m.name })} className={btn.danger} icon="delete">
                      {t("common.delete")}
                    </ActionButton>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title={t("admin.createMess")} icon={Plus}>
        <p className="mb-3 text-sm text-slate-500">{t("admin.createMessHelp")}</p>
        <ActionForm action={createMessWithManager}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("onboarding.messName")}>
              <input name="name" required className={inputClass} />
            </Field>
            <Field label={`${t("onboarding.address")} (${t("common.optional")})`}>
              <input name="address" className={inputClass} />
            </Field>
            <Field label={t("admin.managerName")}>
              <input name="manager_name" required className={inputClass} />
            </Field>
            <Field label={`${t("common.phone")} (${t("common.optional")})`}>
              <input name="phone" type="tel" className={inputClass} />
            </Field>
            <Field label={t("members.login")} hint={t("admin.loginHint")}>
              <input name="login" required autoCapitalize="none" className={inputClass} />
            </Field>
            <Field label={t("members.tempPassword")} hint={t("members.tempPasswordHint")}>
              <input name="password" defaultValue={tempPassword()} className={`${inputClass} font-mono`} />
            </Field>
          </div>
          <SubmitButton>{t("admin.createMess")}</SubmitButton>
        </ActionForm>
      </Card>
      <p className="text-xs text-slate-500">{t("admin.totalMembers", { count: fmtNumber(locale, messes.reduce((a, m) => a + m.mess_members.filter((x) => x.status === "active").length, 0)) })}</p>
    </div>
  );
}
