import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { AuthShell } from "@/components/auth-shell";
import { btn, Card, Field, inputClass } from "@/components/ui";
import { signIn } from "@/lib/actions/auth";
import { getSession } from "@/lib/mess";

export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { user } = await getSession();
  if (user) redirect({ href: "/dashboard", locale });
  const t = await getTranslations("auth");

  return (
    <AuthShell>
      <Card title={t("login")}>
        <ActionForm action={signIn} reset={false}>
          <Field label={t("emailOrUsername")}>
            <input name="email" required autoComplete="username" autoCapitalize="none" className={inputClass} />
          </Field>
          <Field label={t("password")}>
            <input name="password" type="password" required autoComplete="current-password" className={inputClass} />
          </Field>
          <SubmitButton className={`${btn.primary} w-full py-2.5`}>{t("login")}</SubmitButton>
        </ActionForm>
      </Card>
      <p className="text-center text-sm">
        {t("noAccount")}{" "}
        <Link href="/signup" className="inline-flex min-h-9 items-center rounded-lg px-1.5 font-semibold text-brand-700 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-950/50">
          {t("signup")}
        </Link>
      </p>
    </AuthShell>
  );
}
