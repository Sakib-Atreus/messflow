import { getTranslations } from "next-intl/server";
import { ChefHat } from "lucide-react";
import { ActionButton } from "@/components/action-button";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { RowPanels } from "@/components/row-panels";
import { Avatar, btn, Card, Field, inputClass } from "@/components/ui";
import { addCook, removeCook, resetCookPassword } from "@/lib/actions/people";
import { createAdminClient } from "@/lib/supabase/server";
import { tempPassword } from "@/lib/login-id";
import type { getContext } from "@/lib/mess";

type Supa = Awaited<ReturnType<typeof getContext>>["supabase"];

/** Manager only: the cook (khala) logins of this mess. A cook only sees the kitchen page. */
export async function CookCard({ supabase, messId }: { supabase: Supa; messId: string }) {
  const t = await getTranslations();
  const { data } = await supabase.from("mess_cooks").select("id, name, user_id").eq("mess_id", messId).order("created_at");
  const cooks = (data ?? []) as { id: string; name: string; user_id: string }[];
  const { data: profiles } = cooks.length
    ? await createAdminClient().from("profiles").select("id, username").in("id", cooks.map((c) => c.user_id))
    : { data: [] };
  const username = new Map((profiles ?? []).map((p: { id: string; username: string | null }) => [p.id, p.username]));

  return (
    <Card title={t("cook.title")} icon={ChefHat}>
      <p className="mb-3 text-sm text-slate-500">{t("cook.help")}</p>
      {cooks.length > 0 && (
        <ul className="mb-3 divide-y divide-slate-100 dark:divide-slate-800">
          {cooks.map((c) => (
            <li key={c.id} className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <Avatar name={c.name} />
                  <div>
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-slate-500">
                      {t("members.loginLabel")}: <span className="font-mono">{username.get(c.user_id) ?? "-"}</span>
                    </div>
                  </div>
                </div>
                <ActionButton action={removeCook.bind(null, c.id)} icon="delete" className={btn.danger} confirm={t("cook.removeConfirm", { name: c.name })}>
                  {t("cook.remove")}
                </ActionButton>
              </div>
              <div className="mt-2">
                <RowPanels
                  panels={[{
                    key: "password", icon: "password", label: t("admin.resetPassword"),
                    content: (
                      <ActionForm action={resetCookPassword} reset={false}>
                        <input type="hidden" name="id" value={c.id} />
                        <Field label={t("members.tempPassword")} hint={t("members.tempPasswordHint")}>
                          <input name="password" defaultValue={tempPassword()} className={`${inputClass} font-mono`} />
                        </Field>
                        <SubmitButton className={btn.secondary}>{t("admin.resetPassword")}</SubmitButton>
                      </ActionForm>
                    ),
                  }]}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
      <RowPanels
        panels={[{
          key: "add", icon: "login", highlight: cooks.length === 0, label: t("cook.add"),
          content: (
            <ActionForm action={addCook}>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label={t("cook.name")}>
                  <input name="name" required placeholder={t("cook.namePlaceholder")} className={inputClass} />
                </Field>
                <Field label={t("members.login")} hint={t("members.loginHint")}>
                  <input name="login" required autoCapitalize="none" placeholder="khala" className={inputClass} />
                </Field>
                <Field label={t("members.tempPassword")} hint={t("members.tempPasswordHint")}>
                  <input name="password" defaultValue={tempPassword()} className={`${inputClass} font-mono`} />
                </Field>
              </div>
              <SubmitButton>{t("cook.create")}</SubmitButton>
            </ActionForm>
          ),
        }]}
      />
    </Card>
  );
}
