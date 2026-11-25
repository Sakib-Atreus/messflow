import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LangSwitch, MoreLinks } from "@/components/nav";
import { ThemeSwitch } from "@/components/theme-toggle";
import { NotificationSettings } from "@/components/notification-settings";
import { DEFAULT_PREFS, type NotifyPrefs } from "@/lib/push";
import { Avatar, btn, Card, PageTitle } from "@/components/ui";
import { signOut } from "@/lib/actions/auth";
import { getContext } from "@/lib/mess";
import { getPending } from "@/lib/pending";
import { displayLogin } from "@/lib/login-id";
import { Link } from "@/i18n/navigation";

export default async function MorePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { supabase, me, mess, user, perms, isManager, isSuperAdmin, can, profile: profileRow } = await getContext();
  const badges = await getPending(supabase, mess.id, { members: can("members"), deposits: can("deposits"), superAdmin: isSuperAdmin });
  const t = await getTranslations();
  const { data: profile } = await supabase.from("profiles").select("notify_prefs").eq("id", user.id).single();
  const prefs = { ...DEFAULT_PREFS, ...((profile?.notify_prefs ?? {}) as Partial<NotifyPrefs>) };

  return (
    <div className="space-y-5">
      <PageTitle>{t("nav.more")}</PageTitle>
      <MoreLinks access={{ perms, isManager, isSuperAdmin, badges }} />
      <Card title={t("theme.label")}>
        <ThemeSwitch />
      </Card>
      <Card title={t("notify.title")}>
        <NotificationSettings vapidKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null} prefs={prefs} />
      </Card>
      <Card>
        <Link href="/profile" className="-m-2 mb-1 flex items-center gap-3 rounded-xl p-2 hover:bg-slate-50 dark:hover:bg-slate-800/60">
          <Avatar name={me.display_name} src={profileRow?.avatar_url} className="size-12" />
          <span className="text-sm font-medium text-brand-700 dark:text-brand-400">{t("nav.profile")} →</span>
        </Link>
        <div className="font-medium">{me.display_name}</div>
        <div className="text-sm text-slate-500">
          {displayLogin(user.email)} · {me.role === "manager" ? t("roles.manager") : (me.mess_role?.name ?? t("roles.member"))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Suspense>
            <LangSwitch className={btn.secondary} />
          </Suspense>
          <Link href="/change-password" className={btn.secondary}>
            {t("auth.changePassword")}
          </Link>
          <form action={signOut}>
            <button className={btn.secondary}>{t("nav.signOut")}</button>
          </form>
        </div>
      </Card>
    </div>
  );
}
