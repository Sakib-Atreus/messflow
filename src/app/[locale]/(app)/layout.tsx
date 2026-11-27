import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LogOut, ShieldCheck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { BottomNav, LangSwitch, SideNav } from "@/components/nav";
import { ThemeButton } from "@/components/theme-toggle";
import { MessSwitcher } from "@/components/mess-switcher";
import { PendingBell, type InboxItem } from "@/components/pending-bell";
import { getPending } from "@/lib/pending";
import { Avatar, Logo } from "@/components/ui";
import { signOut } from "@/lib/actions/auth";
import { getContext } from "@/lib/mess";

export default async function AppLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { supabase, mess, me, memberships, perms, isManager, isSuperAdmin, isVirtual, can, profile } = await getContext();
  const t = await getTranslations();
  // all at once: fill in any days the nightly job missed, roll the weekly bazar-duty plan and repeating
  // bills forward (all idempotent and cheap), plus the bell counts and the notification inbox
  const [, , , pending, { data: inboxRows }] = await Promise.all([
    supabase.rpc("ensure_meals", { p_mess: mess.id }),
    supabase.rpc("ensure_weekly_duty", { p_mess: mess.id }),
    supabase.rpc("ensure_recurring_bills", { p_mess: mess.id }),
    getPending(supabase, mess.id, { members: can("members"), deposits: can("deposits"), superAdmin: isSuperAdmin, manager: isManager }),
    supabase.from("notifications").select("id, title, body, url, created_at, read_at").order("created_at", { ascending: false }).limit(15),
  ]);
  const access = { perms, isManager, isSuperAdmin, badges: pending };
  const bell = [
    can("members") && { href: "/members", key: "joins" as const, count: pending["/members"] },
    can("deposits") && { href: "/deposits", key: "deposits" as const, count: pending["/deposits"] },
    isSuperAdmin && { href: "/admin", key: "messRequests" as const, count: pending["/admin"] },
    isManager && { href: "/meals", key: "cookOffers" as const, count: pending["/meals"] },
  ].filter((x) => !!x);
  const roleLabel = isVirtual
    ? t("roles.superAdmin")
    : me.role === "manager"
      ? t("roles.manager")
      : (me.mess_role?.name ?? t("roles.member"));
  const options = memberships.map((m) => ({ id: m.mess_id, name: m.mess.name }));
  if (isVirtual) options.push({ id: mess.id, name: mess.name });

  return (
    <div className="min-h-dvh pb-24 md:pb-0">
      <header className="no-print sticky top-0 z-10 border-b border-slate-200/80 bg-white/85 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/85">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 lg:px-8">
          <div className="flex min-w-0 items-center gap-2.5">
            <Link href="/dashboard" className="flex items-center gap-2">
              <Logo className="size-9" />
              <span className="hidden text-lg font-bold tracking-tight text-brand-700 sm:inline dark:text-brand-400">
                {t("app.name")}
              </span>
            </Link>
            <span className="hidden h-6 w-px bg-slate-200 sm:block dark:bg-slate-700" />
            <MessSwitcher current={mess.id} options={options} />
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            {isSuperAdmin && (
              <Link
                href="/admin"
                className="hidden items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-brand-700 hover:bg-brand-50 sm:inline-flex dark:text-brand-400 dark:hover:bg-brand-950"
              >
                <ShieldCheck className="size-4" /> {t("nav.admin")}
              </Link>
            )}
            <PendingBell items={bell} inbox={(inboxRows ?? []) as InboxItem[]} />
            <ThemeButton />
            <Suspense>
              <LangSwitch />
            </Suspense>
            <Link href="/profile" aria-label={t("nav.profile")} className="rounded-full md:hidden">
              <Avatar name={me.display_name} src={profile?.avatar_url} className="size-8" />
            </Link>
            <div className="hidden items-center gap-2 border-l border-slate-200 pl-3 md:flex dark:border-slate-700">
              <Link href="/profile" title={t("nav.profile")} className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 hover:bg-slate-100 dark:hover:bg-slate-800">
                <Avatar name={me.display_name} src={profile?.avatar_url} className="size-8" />
                <div className="leading-tight">
                  <div className="max-w-32 truncate text-sm font-medium">{me.display_name}</div>
                  <div className="text-xs text-slate-500">{roleLabel}</div>
                </div>
              </Link>
              <form action={signOut}>
                <button title={t("nav.signOut")} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                  <LogOut className="size-4" />
                </button>
              </form>
            </div>
          </div>
        </div>
      </header>
      {isVirtual && (
        <div className="no-print border-b border-sky-200 bg-sky-50 px-4 py-2 text-center text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-200">
          {t("admin.viewingAs", { mess: mess.name })}{" "}
          <Link href="/admin" className="ml-1 inline-flex min-h-8 items-center rounded-md px-2 font-semibold underline underline-offset-2 hover:bg-sky-100 dark:hover:bg-sky-900/50">
            {t("admin.backToPanel")}
          </Link>
        </div>
      )}
      <div className="mx-auto flex max-w-7xl gap-8 px-4 py-6 lg:px-8">
        <SideNav access={access} />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
      <BottomNav access={access} />
    </div>
  );
}
