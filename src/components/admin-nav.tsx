"use client";

import { useTranslations } from "next-intl";
import { Building2, LayoutDashboard, Users } from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";
import { CountBadge } from "./nav";
import { cn } from "./ui";

const items = [
  { href: "/admin", key: "overview", Icon: LayoutDashboard, exact: true },
  { href: "/admin/messes", key: "messes", Icon: Building2 },
  { href: "/admin/users", key: "users", Icon: Users },
] as const;

export function AdminNav({ requests = 0 }: { requests?: number }) {
  const t = useTranslations("admin");
  const path = usePathname();
  return (
    <nav className="no-print -mx-4 flex gap-1 overflow-x-auto px-4 pb-1">
      {items.map(({ href, key, Icon, ...rest }) => {
        const active = "exact" in rest ? path === href : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition",
              active ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
            )}
          >
            <Icon className="size-4" /> {t(key)}
            {href === "/admin" && <CountBadge n={requests} inverted={active} />}
          </Link>
        );
      })}
    </nav>
  );
}
