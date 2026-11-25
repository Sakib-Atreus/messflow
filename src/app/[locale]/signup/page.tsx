import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { AuthShell } from "@/components/auth-shell";
import { btn, Card, Field, inputClass } from "@/components/ui";
import { signUp } from "@/lib/actions/auth";
import { getSession } from "@/lib/mess";

export default async function SignupPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { user } = await getSession();
  if (user) redirect({ href: "/dashboard", locale });
  const t = await getTranslations();

  return (
    <AuthShell>
      <Card title={t("auth.signup")}>
        <p className="mb-3 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900 dark:bg-sky-950/50 dark:text-sky-200">
          {t("auth.approvalNote")}
        </p>
        <ActionForm action={signUp} reset={false}>
          <Field label={t("auth.fullName")}>
            <input name="full_name" required autoComplete="name" className={inputClass} />
          </Field>
          <Field label={`${t("common.phone")} (${t("common.optional")})`}>
            <input name="phone" type="tel" autoComplete="tel" className={inputClass} />
          </Field>
          <Field label={t("auth.email")}>
            <input name="email" type="email" required autoComplete="email" className={inputClass} />
          </Field>
          <Field label={t("auth.password")}>
            <input name="password" type="password" required minLength={6} autoComplete="new-password" className={inputClass} />
          </Field>
          <SubmitButton className={`${btn.primary} w-full py-2.5`}>{t("auth.signup")}</SubmitButton>
        </ActionForm>
      </Card>
      <p className="text-center text-sm">
        {t("auth.haveAccount")}{" "}
        <Link href="/login" className="inline-flex min-h-9 items-center rounded-lg px-1.5 font-semibold text-brand-700 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-950/50">
          {t("auth.login")}
        </Link>
      </p>
    </AuthShell>
  );
}
