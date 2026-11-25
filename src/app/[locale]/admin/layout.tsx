import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LogOut } from "lucide-react";
import { Link, redirect } from "@/i18n/navigation";
import { AdminNav } from "@/components/admin-nav";
import { PendingBell, type InboxItem } from "@/components/pending-bell";
import { getPending } from "@/lib/pending";
import { ThemeButton } from "@/components/theme-toggle";
import { LangSwitch } from "@/components/nav";
import { Avatar, Badge, Logo } from "@/components/ui";
import { signOut } from "@/lib/actions/auth";
import { requireUser } from "@/lib/mess";

export default async function AdminLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { supabase, profile, isSuperAdmin } = await requireUser();
  if (!isSuperAdmin) return redirect({ href: "/dashboard", locale });
  const t = await getTranslations();
  const [pending, { data: inboxRows }] = await Promise.all([
    getPending(supabase, null, { members: false, deposits: false, superAdmin: true }),
    supabase.from("notifications").select("id, title, body, url, created_at, read_at").order("created_at", { ascending: false }).limit(15),
  ]);

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-slate-200/80 bg-white/85 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/85">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 lg:px-8">
          <Link href="/admin" className="flex min-w-0 items-center gap-2">
            <Logo className="size-9" />
            <span className="hidden text-lg font-bold tracking-tight text-brand-700 sm:inline dark:text-brand-400">{t("app.name")}</span>
            <Badge tone="blue">{t("roles.superAdmin")}</Badge>
          </Link>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <PendingBell items={[{ href: "/admin", key: "messRequests", count: pending["/admin"] }]} inbox={(inboxRows ?? []) as InboxItem[]} />
            <ThemeButton />
            <Suspense>
              <LangSwitch />
            </Suspense>
            <Link href="/profile" aria-label={t("nav.profile")} className="hidden rounded-full sm:block">
              <Avatar name={profile?.full_name || "Admin"} src={profile?.avatar_url} className="size-8" />
            </Link>
            <form action={signOut}>
              <button title={t("nav.signOut")} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                <LogOut className="size-4" />
              </button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 lg:px-8">
        <AdminNav requests={pending["/admin"]} />
        {children}
      </div>
    </div>
  );
}
