import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { AuthShell } from "@/components/auth-shell";
import { btn, Card, Field, inputClass } from "@/components/ui";
import { changePassword, signOut } from "@/lib/actions/auth";
import { getProfile, getSession } from "@/lib/mess";

export default async function ChangePasswordPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { user } = await getSession();
  if (!user) redirect({ href: "/login", locale });
  const profile = await getProfile();
  const forced = !!profile?.must_change_password;
  const t = await getTranslations();

  return (
    <AuthShell>
      <Card title={t("auth.changePassword")}>
        {forced && (
          <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
            {t("auth.mustChange", { name: profile?.full_name || "" })}
          </p>
        )}
        <ActionForm action={changePassword} reset={false}>
          <Field label={t("auth.newPassword")} hint={t("auth.passwordHint")}>
            <input name="password" type="password" required minLength={6} autoComplete="new-password" className={inputClass} />
          </Field>
          <Field label={t("auth.confirmPassword")}>
            <input name="confirm" type="password" required minLength={6} autoComplete="new-password" className={inputClass} />
          </Field>
          <SubmitButton className={`${btn.primary} w-full py-2.5`}>{t("auth.savePassword")}</SubmitButton>
        </ActionForm>
      </Card>
      <div className="flex justify-center gap-2">
        {!forced && (
          <Link href="/dashboard" className={btn.secondary}>
            {t("common.cancel")}
          </Link>
        )}
        <form action={signOut}>
          <button className={btn.secondary}>{t("nav.signOut")}</button>
        </form>
      </div>
    </AuthShell>
  );
}
