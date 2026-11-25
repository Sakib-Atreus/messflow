"use client";

import { useEffect, useRef } from "react";
import NextLink from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { markInboxRead } from "@/lib/actions/features";
import { cn } from "./ui";
import { Bell, CheckCircle2, ChevronRight } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { CountBadge } from "./nav";

type Item = { href: string; key: "joins" | "deposits" | "messRequests"; count: number };
export type InboxItem = { id: string; title: string; body: string | null; url: string | null; created_at: string; read_at: string | null };

/** "5 min ago", "2 days ago" in the page language */
function ago(iso: string, locale: string) {
  const s = (Date.parse(iso) - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale === "bn" ? "bn-BD" : "en", { numeric: "auto" });
  const steps: [number, Intl.RelativeTimeFormatUnit][] = [[60, "second"], [60, "minute"], [24, "hour"], [7, "day"], [4.35, "week"], [12, "month"]];
  let v = s;
  for (const [n, unit] of steps) {
    if (Math.abs(v) < n) return rtf.format(Math.round(v), unit);
    v /= n;
  }
  return rtf.format(Math.round(v), "year");
}

/**
 * Header bell: total of things waiting for me, with a dropdown to jump to each.
 * Also keeps counts fresh (on push / when the app comes back to the front) and sets the
 * installed app's icon badge.
 */
export function PendingBell({ items, inbox = [] }: { items: Item[]; inbox?: InboxItem[] }) {
  const t = useTranslations("pending");
  const locale = useLocale();
  const router = useRouter();
  const ref = useRef<HTMLDetailsElement>(null);
  const waiting = items.reduce((a, i) => a + i.count, 0);
  const unread = inbox.filter((n) => !n.read_at).length;
  const total = waiting + unread;
  // opening the bell marks the inbox as read (once per opening)
  const onToggle = () => {
    if (ref.current?.open && unread) markInboxRead().then(() => router.refresh());
  };

  useEffect(() => {
    const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    (total ? nav.setAppBadge?.(total) : nav.clearAppBadge?.())?.catch(() => {});
  }, [total]);

  useEffect(() => {
    let last = Date.now();
    const refresh = () => {
      if (Date.now() - last < 15_000) return;
      last = Date.now();
      router.refresh();
    };
    const onVisible = () => document.visibilityState === "visible" && refresh();
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === "push") {
        last = 0;
        refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, [router]);

  // close when clicking anywhere else
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current?.open && !ref.current.contains(e.target as Node) && (ref.current.open = false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  return (
    <details ref={ref} className="relative" onToggle={onToggle}>
      <summary
        className="relative list-none rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 [&::-webkit-details-marker]:hidden"
        aria-label={t("title")}
        title={t("title")}
      >
        <Bell className="size-[18px]" />
        <CountBadge n={total} className="absolute -right-0.5 -top-0.5 h-4 min-w-4 px-1 text-[10px] ring-2 ring-white dark:ring-slate-900" />
      </summary>
      <div className="absolute right-0 z-30 mt-2 max-h-[75vh] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold dark:border-slate-800">{t("title")}</div>
        {waiting === 0 ? (
          <div className="flex items-center gap-2 px-4 py-5 text-sm text-slate-500">
            <CheckCircle2 className="size-5 text-brand-600" /> {t("allClear")}
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {items
              .filter((i) => i.count > 0)
              .map((i) => (
                <li key={i.key}>
                  <Link
                    href={i.href}
                    onClick={() => ref.current && (ref.current.open = false)}
                    className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  >
                    <CountBadge n={i.count} />
                    <span className="flex-1">{t(i.key, { count: i.count })}</span>
                    <ChevronRight className="size-4 text-slate-400" />
                  </Link>
                </li>
              ))}
          </ul>
        )}

        {/* recent notifications */}
        <div className="border-y border-slate-100 bg-slate-50/70 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/40">
          {t("recent")}
        </div>
        {inbox.length === 0 ? (
          <div className="px-4 py-5 text-sm text-slate-500">{t("noNotifications")}</div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {inbox.map((n) => (
              <li key={n.id}>
                <NextLink
                  href={n.url || "#"}
                  onClick={() => ref.current && (ref.current.open = false)}
                  className="flex gap-3 px-4 py-3 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/60"
                >
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-brand-500")} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block", !n.read_at && "font-semibold")}>{n.title}</span>
                    {n.body && <span className="line-clamp-2 block text-slate-500 dark:text-slate-400">{n.body}</span>}
                    <span className="mt-0.5 block text-xs text-slate-400">{ago(n.created_at, locale)}</span>
                  </span>
                </NextLink>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
