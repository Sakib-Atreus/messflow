import "server-only";
import { sendNotification } from "web-push";
import { createTranslator } from "next-intl";
import { createAdminClient } from "@/lib/supabase/server";
import bn from "../../messages/bn.json";
import en from "../../messages/en.json";

export type PrefKey = "cutoff" | "duty" | "dues" | "notices" | "deposits";
export type NotifyPrefs = Record<PrefKey, boolean>;
export const DEFAULT_PREFS: NotifyPrefs = { cutoff: true, duty: true, dues: true, notices: true, deposits: true };

export type PushPayload = { title: string; body: string; url?: string; tag?: string };

export const pushEnabled = () => !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

export function translatorFor(locale: string) {
  return createTranslator({ locale: locale === "en" ? "en" : "bn", messages: locale === "en" ? en : bn });
}
export type T = ReturnType<typeof translatorFor>;

type ProfileWithSubs = {
  id: string;
  locale: string;
  notify_prefs: Partial<NotifyPrefs> | null;
  push_subscriptions: { id: string; endpoint: string; p256dh: string; auth: string }[];
};

/**
 * Sends a notification to every device of each user, in the user's own language.
 * `pref` = which preference must be on (null = always send, e.g. a test).
 * `build` returns null to skip a user.
 */
export async function pushToUsers(
  userIds: (string | null | undefined)[],
  pref: PrefKey | null,
  build: (t: T, ctx: { userId: string; locale: "bn" | "en" }) => PushPayload | null,
  /** called once per user who got it on at least one device */
  onDelivered?: (userId: string) => void,
): Promise<number> {
  const ids = [...new Set(userIds.filter((x): x is string => !!x))];
  if (ids.length === 0) return 0;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id, locale, notify_prefs, push_subscriptions(id, endpoint, p256dh, auth)")
    .in("id", ids);
  if (error) {
    console.error("[push] load subscriptions:", error.message);
    return 0;
  }

  const vapidDetails = {
    subject: process.env.VAPID_SUBJECT || "mailto:admin@example.com",
    publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    privateKey: process.env.VAPID_PRIVATE_KEY!,
  };

  let sent = 0;
  const inbox: { user_id: string; title: string; body: string | null; url: string }[] = [];
  const jobs = (data as ProfileWithSubs[]).flatMap((p) => {
    const locale = p.locale === "en" ? "en" : "bn";
    const payload = build(translatorFor(locale), { userId: p.id, locale });
    if (!payload) return [];
    // keep a copy for the bell (not the daily cutoff nudges - they'd bury everything else)
    if (pref !== "cutoff") inbox.push({ user_id: p.id, title: payload.title, body: payload.body ?? null, url: payload.url ?? `/${locale}/dashboard` });
    if (!pushEnabled() || !p.push_subscriptions.length) return [];
    if (pref && p.notify_prefs?.[pref] === false) return [];
    const body = JSON.stringify({ ...payload, url: payload.url ?? `/${locale}/dashboard` });
    return p.push_subscriptions.map(async (s) => {
      try {
        await sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, {
          vapidDetails,
          TTL: 6 * 60 * 60,
        });
        sent++;
        onDelivered?.(p.id);
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          await admin.from("push_subscriptions").delete().eq("id", s.id); // device unsubscribed / expired
        } else {
          console.error("[push] send failed:", code, (e as Error).message);
        }
      }
    });
  });
  await Promise.all(jobs);
  if (inbox.length) {
    const { error: inboxError } = await admin.from("notifications").insert(inbox);
    if (inboxError) console.error("[push] inbox:", inboxError.message);
  }
  return sent;
}
