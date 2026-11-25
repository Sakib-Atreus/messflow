"use client";

import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { updateProfileLocale } from "@/lib/actions/mess";
import {
  Home, UtensilsCrossed, ShoppingCart, Wallet, Ellipsis, Users, Receipt, FileText, Settings, Languages,
  CalendarCheck, Megaphone, ShieldCheck, KeyRound, Sheet, type LucideIcon,
} from "lucide-react";
import { cn } from "./ui";

/** What the current user may see; computed on the server from their role. */
export type NavAccess = { perms: string[]; isManager: boolean; isSuperAdmin: boolean; badges?: Record<string, number> };

/** Red count bubble, like an app notification badge. */
export function CountBadge({ n, className, inverted }: { n: number | undefined; className?: string; inverted?: boolean }) {
  if (!n) return null;
  return (
    <span
      className={cn(
        "inline-grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-bold leading-none tabular-nums",
        inverted ? "bg-white text-brand-700" : "bg-red-600 text-white",
        className,
      )}
    >
      {n > 99 ? "99+" : n}
    </span>
  );
}
type Item = { href: string; key: string; Icon: LucideIcon; show?: (a: NavAccess) => boolean };

const main: Item[] = [
  { href: "/dashboard", key: "dashboard", Icon: Home },
  { href: "/meals", key: "meals", Icon: UtensilsCrossed },
  { href: "/bazar", key: "bazar", Icon: ShoppingCart },
  { href: "/deposits", key: "deposits", Icon: Wallet },
];

const extra: Item[] = [
  { href: "/sheet", key: "sheet", Icon: Sheet },
  { href: "/notices", key: "notices", Icon: Megaphone },
  { href: "/roster", key: "roster", Icon: CalendarCheck },
  { href: "/report", key: "report", Icon: FileText },
  { href: "/costs", key: "costs", Icon: Receipt },
  { href: "/members", key: "members", Icon: Users },
  { href: "/roles", key: "roles", Icon: KeyRound, show: (a) => a.isManager },
  { href: "/settings", key: "settings", Icon: Settings, show: (a) => a.perms.includes("settings") },
];

const admin: Item = { href: "/admin", key: "admin", Icon: ShieldCheck, show: (a) => a.isSuperAdmin };

const visible = (items: Item[], a: NavAccess) => items.filter((i) => !i.show || i.show(a));

function NavLink({ item, active, label, count }: { item: Item; active: boolean; label: string; count?: number }) {
  const { Icon } = item;
  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2 font-medium transition",
        active
          ? "bg-brand-600 text-white shadow-sm shadow-brand-900/20"
          : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
      )}
    >
      <Icon className="size-5" /> <span className="flex-1">{label}</span>
      <CountBadge n={count} inverted={active} />
    </Link>
  );
}

export function SideNav({ access }: { access: NavAccess }) {
  const t = useTranslations("nav");
  const path = usePathname();
  const group = (title: string, items: Item[]) =>
    items.length > 0 && (
      <div className="space-y-1">
        <div className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</div>
        {items.map((i) => (
          <NavLink key={i.href} item={i} active={path.startsWith(i.href)} label={t(i.key)} count={access.badges?.[i.href]} />
        ))}
      </div>
    );
  return (
    <nav className="no-print sticky top-20 hidden w-56 shrink-0 self-start md:block">
      {group(t("groupDaily"), main)}
      {group(t("groupMess"), visible(extra, access))}
      {group(t("groupPlatform"), visible([admin], access))}
    </nav>
  );
}

export function BottomNav({ access }: { access: NavAccess }) {
  const t = useTranslations("nav");
  const path = usePathname();
  const more = visible([...extra, admin], access);
  const moreActive = more.some((e) => path.startsWith(e.href)) || path.startsWith("/more");
  const items: Item[] = [...main, { href: "/more", key: "more", Icon: Ellipsis }];
  const countFor = (href: string) =>
    href === "/more" ? more.reduce((a, i) => a + (access.badges?.[i.href] ?? 0), 0) : access.badges?.[href];
  return (
    <nav className="no-print fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden dark:border-slate-800 dark:bg-slate-900/95">
      <div className="grid grid-cols-5">
        {items.map(({ href, key, Icon }) => {
          const active = href === "/more" ? moreActive : path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn("flex flex-col items-center gap-0.5 py-2 text-xs", active ? "text-brand-600 dark:text-brand-400" : "text-slate-500")}
            >
              <span className={cn("relative rounded-full px-4 py-0.5 transition", active && "bg-brand-100 dark:bg-brand-950")}>
                <Icon className="size-5" />
                <CountBadge n={countFor(href)} className="absolute -top-1.5 right-1 ring-2 ring-white dark:ring-slate-900" />
              </span>
              {t(key)}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function MoreLinks({ access }: { access: NavAccess }) {
  const t = useTranslations("nav");
  return (
    <div className="grid grid-cols-3 gap-3">
      {visible([...extra, admin], access).map(({ href, key, Icon }) => (
        <Link
          key={href}
          href={href}
          className="relative flex flex-col items-center gap-2 rounded-2xl border border-slate-200/80 bg-white p-4 text-center text-sm font-medium shadow-sm dark:border-slate-800 dark:bg-slate-900"
        >
          <CountBadge n={access.badges?.[href]} className="absolute right-2 top-2" />
          <span className="grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-400">
            <Icon className="size-6" />
          </span>
          {t(key)}
        </Link>
      ))}
    </div>
  );
}

export function LangSwitch({ className }: { className?: string }) {
  const t = useTranslations("nav");
  const locale = useLocale();
  const path = usePathname();
  const router = useRouter();
  const search = useSearchParams();
  const next = locale === "bn" ? "en" : "bn";
  return (
    <button
      type="button"
      className={cn("inline-flex min-h-9 items-center gap-1 whitespace-nowrap rounded-lg px-2 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800", className)}
      onClick={() => {
        const qs = search.toString();
        router.replace(qs ? `${path}?${qs}` : path, { locale: next });
        updateProfileLocale(next).catch(() => {});
      }}
    >
      <Languages className="size-4" /> {t("language")}
    </button>
  );
}
