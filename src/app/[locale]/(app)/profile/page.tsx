import { getTranslations, setRequestLocale } from "next-intl/server";
import { AtSign, Camera, KeyRound, UserRound } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { AvatarUpload } from "@/components/avatar-upload";
import { btn, Card, Field, inputClass, PageTitle } from "@/components/ui";
import { changeEmail, updateProfile } from "@/lib/actions/profile";
import { getContext } from "@/lib/mess";
import { USERNAME_DOMAIN } from "@/lib/login-id";

export default async function ProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { user, profile } = await getContext();
  const t = await getTranslations();
  const placeholder = !!user.email?.endsWith(`@${USERNAME_DOMAIN}`);
  const realEmail = placeholder ? null : user.email;
  const name = profile?.full_name || "";

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageTitle sub={t("profile.subtitle")}>{t("profile.title")}</PageTitle>

      <Card title={t("profile.photo")} icon={Camera}>
        <AvatarUpload userId={user.id} name={name || "?"} current={profile?.avatar_url ?? null} />
      </Card>

      <Card title={t("profile.details")} icon={UserRound}>
        <ActionForm action={updateProfile} reset={false}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("profile.name")}>
              <input name="full_name" defaultValue={name} required className={inputClass} />
            </Field>
            <Field label={`${t("common.phone")} (${t("common.optional")})`}>
              <input name="phone" type="tel" defaultValue={profile?.phone ?? ""} className={inputClass} />
            </Field>
          </div>
          <SubmitButton>{t("common.save")}</SubmitButton>
        </ActionForm>
      </Card>

      <Card title={t("profile.emailTitle")} icon={AtSign}>
        <dl className="mb-4 divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm dark:divide-slate-800 dark:border-slate-700">
          {profile?.username && (
            <div className="flex items-center justify-between gap-3 px-3 py-2.5">
              <dt className="text-slate-500">{t("profile.username")}</dt>
              <dd className="font-mono font-medium">{profile.username}</dd>
            </div>
          )}
          <div className="flex items-center justify-between gap-3 px-3 py-2.5">
            <dt className="text-slate-500">{t("profile.email")}</dt>
            <dd className={realEmail ? "font-medium" : "text-right text-amber-700 dark:text-amber-400"}>{realEmail ?? t("profile.noEmail")}</dd>
          </div>
        </dl>
        <p className="mb-3 text-sm text-slate-500">{t("profile.emailHelp")}</p>
        <ActionForm action={changeEmail}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("profile.newEmail")}>
              <input name="email" type="email" required autoComplete="email" placeholder="name@gmail.com" className={inputClass} />
            </Field>
            <Field label={t("profile.currentPassword")}>
              <input name="password" type="password" required autoComplete="current-password" className={inputClass} />
            </Field>
          </div>
          <SubmitButton>{t("profile.saveEmail")}</SubmitButton>
        </ActionForm>
      </Card>

      <Card title={t("profile.security")} icon={KeyRound}>
        <Link href="/change-password" className={btn.secondary}>
          <KeyRound className="size-4" /> {t("profile.changePassword")}
        </Link>
      </Card>
    </div>
  );
}
