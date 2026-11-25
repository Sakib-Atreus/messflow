import { getTranslations, setRequestLocale } from "next-intl/server";
import { Clock, Home, UserPlus, XCircle } from "lucide-react";
import { redirect } from "@/i18n/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { AuthShell } from "@/components/auth-shell";
import { Tabs } from "@/components/tabs";
import { NotificationSettings } from "@/components/notification-settings";
import { DEFAULT_PREFS } from "@/lib/push";
import { Alert, btn, Card, Field, inputClass } from "@/components/ui";
import { joinMess, requestMess } from "@/lib/actions/mess";
import { signOut } from "@/lib/actions/auth";
import { requireUser } from "@/lib/mess";
import { createAdminClient } from "@/lib/supabase/server";

type Req = { id: string; status: string; created_at: string };

export default async function OnboardingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ code?: string }>;
}) {
  const { locale } = await params;
  const { code } = await searchParams;
  setRequestLocale(locale);
  const { supabase, user, profile, isSuperAdmin } = await requireUser();
  if (isSuperAdmin) redirect({ href: "/admin", locale });
  const { count } = await supabase.from("mess_members").select("id", { count: "exact", head: true }).eq("user_id", user.id);
  if (count) redirect({ href: "/dashboard", locale });

  const t = await getTranslations();
  const name = profile?.full_name ?? "";
  const [{ data: messReqs }, { data: joinReqs }] = await Promise.all([
    supabase.from("mess_requests").select("id, status, created_at, name").order("created_at", { ascending: false }).limit(3),
    supabase.from("join_requests").select("id, status, created_at, mess_id").order("created_at", { ascending: false }).limit(3),
  ]);
  // a pending user can't read the mess yet, so look up just the names of messes they asked to join
  const messIds = [...new Set((joinReqs ?? []).map((j) => j.mess_id))];
  const { data: messNames } = messIds.length
    ? await createAdminClient().from("messes").select("id, name").in("id", messIds)
    : { data: [] as { id: string; name: string }[] };
  const nameOf = (id: string) => messNames?.find((m) => m.id === id)?.name ?? "-";

  const requests = [
    ...((messReqs ?? []) as (Req & { name: string })[]).map((r) => ({ ...r, label: t("onboarding.reqNewMess", { name: r.name }) })),
    ...((joinReqs ?? []) as (Req & { mess_id: string })[]).map((r) => ({ ...r, label: t("onboarding.reqJoin", { name: nameOf(r.mess_id) }) })),
  ].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const hasPending = requests.some((r) => r.status === "pending");

  return (
    <AuthShell>
      <div>
        <h1 className="text-2xl font-bold">{t("onboarding.title")}</h1>
        <p className="text-sm text-slate-500">{t("onboarding.subtitle")}</p>
      </div>

      {requests.length > 0 && (
        <div className="space-y-2">
          {requests.map((r) => (
            <Alert key={r.id} tone={r.status === "pending" ? "amber" : r.status === "approved" ? "green" : "blue"}>
              <div className="flex items-start gap-3">
                {r.status === "pending" ? <Clock className="mt-0.5 size-5" /> : <XCircle className="mt-0.5 size-5" />}
                <div>
                  <div className="font-medium">{r.label}</div>
                  <div className="text-sm opacity-80">{t(`onboarding.status_${r.status}` as "onboarding.status_pending")}</div>
                </div>
              </div>
            </Alert>
          ))}
        </div>
      )}

      {hasPending && (
        <Card title={t("onboarding.notifyTitle")}>
          <p className="mb-3 text-sm text-slate-500">{t("onboarding.notifyHelp")}</p>
          <NotificationSettings vapidKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null} prefs={DEFAULT_PREFS} compact />
        </Card>
      )}

      <Tabs
        initial={code ? "join" : undefined}
        tabs={[
          {
            key: "join",
            label: t("onboarding.tabJoin"),
            icon: <UserPlus className="size-4" />,
            content: (
              <Card>
                <ActionForm action={joinMess} reset={false}>
                  <Field label={t("onboarding.code")} hint={t("onboarding.codeHelp")}>
                    <input name="code" required defaultValue={code} className={`${inputClass} uppercase tracking-widest`} />
                  </Field>
                  <Field label={t("onboarding.yourName")}>
                    <input name="display_name" defaultValue={name} className={inputClass} />
                  </Field>
                  <SubmitButton className={`${btn.primary} w-full py-2.5`}>{t("onboarding.join")}</SubmitButton>
                </ActionForm>
              </Card>
            ),
          },
          // a pending new-mess request hides this tab (only one request at a time)
          ...(hasPending
            ? []
            : [
                {
                  key: "create",
                  label: t("onboarding.tabCreate"),
                  icon: <Home className="size-4" />,
                  content: (
                    <Card>
                      <p className="mb-3 text-sm text-slate-500">{t("onboarding.createHelp")}</p>
                      <ActionForm action={requestMess} reset={false}>
                        <Field label={t("onboarding.messName")}>
                          <input name="name" required className={inputClass} />
                        </Field>
                        <Field label={`${t("onboarding.address")} (${t("common.optional")})`}>
                          <input name="address" className={inputClass} />
                        </Field>
                        <Field label={t("onboarding.yourName")}>
                          <input name="display_name" defaultValue={name} className={inputClass} />
                        </Field>
                        <SubmitButton className={`${btn.primary} w-full py-2.5`}>{t("onboarding.sendRequest")}</SubmitButton>
                      </ActionForm>
                    </Card>
                  ),
                },
              ]),
        ]}
      />

      <form action={signOut} className="text-center">
        <button className={btn.secondary}>{t("nav.signOut")}</button>
      </form>
    </AuthShell>
  );
}
