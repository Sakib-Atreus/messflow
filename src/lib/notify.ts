import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { addDays, cutoffTime, dhakaMinutes, intervalToMinutes, monthEnd, monthStart, todayDhaka } from "@/lib/dates";
import { mealWallet } from "@/lib/meal-wallet";
import { fmtDate, fmtMoney, fmtTime } from "@/lib/format";
import { activeOn, effectiveMeal, getMonthSummary, mealKinds, weightedMeals } from "@/lib/queries";
import { pushEnabled, pushToUsers } from "@/lib/push";
import type { Meal, Member, Mess, PaymentMethod, Permission } from "@/lib/types";

// Reminder timing comes from each mess's Settings (cutoff lead, duty time, dues day/time).
const MEAL_MONEY_FROM = 9 * 60; // daily meal-money check from 9 AM

/** Records that a scheduled notification was sent. Returns false if it was already sent. */
async function claim(admin: SupabaseClient, messId: string, kind: string, key: string) {
  const { data, error } = await admin
    .from("notification_log")
    .upsert({ mess_id: messId, kind, key }, { onConflict: "mess_id,kind,key", ignoreDuplicates: true })
    .select();
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

// ---------------------------------------------------------------- scheduled (every 10 min)
export async function runScheduledNotifications(now = new Date()) {
  if (!pushEnabled()) return { skipped: "push not configured" };
  const admin = createAdminClient();
  const today = todayDhaka(now);
  const minutes = dhakaMinutes(now);
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  const log: string[] = [];

  const { data: messes } = await admin.from("messes").select("*");
  for (const mess of (messes ?? []) as Mess[]) {
    const { data: m } = await admin
      .from("mess_members")
      .select("*")
      .eq("mess_id", mess.id)
      .eq("status", "active")
      .not("user_id", "is", null);
    const members = (m ?? []) as Member[];
    if (!members.length) continue;

    // 1) meal cutoff reminders (for today's meals, or tomorrow's breakfast when its cutoff is tonight)
    for (const kind of mess.cutoff_reminder_min ? mealKinds(mess) : []) {
      for (const day of [today, addDays(today, 1)]) {
        const left = cutoffTime(day, mess[`${kind}_cutoff`]) - now.getTime();
        if (left <= 0 || left > (mess.cutoff_reminder_min ?? 45) * 60_000) continue;
        if (!(await claim(admin, mess.id, "cutoff", `${kind}:${day}`))) continue;

        const { data: rows } = await admin.from("meals").select("*").eq("mess_id", mess.id).eq("date", day);
        const eaters = members.filter((x) => activeOn(x, day));
        const time = intervalToMinutes(mess[`${kind}_cutoff`]);
        const n = await pushToUsers(eaters.map((x) => x.user_id), "cutoff", (t, { userId, locale }) => {
          const me = eaters.find((x) => x.user_id === userId)!;
          const meal = effectiveMeal(mess, me, day, (rows as Meal[] | null)?.find((r) => r.member_id === me.id));
          const name = t(`meal.${kind}`);
          return {
            title: t("push.cutoffTitle", { meal: name, time: fmtTime(locale, time) }),
            body: meal[kind] ? t("push.cutoffOn", { meal: name }) : t("push.cutoffOff", { meal: name }),
            url: `/${locale}/meals`,
            tag: `cutoff-${kind}`,
          };
        });
        log.push(`${mess.name}: cutoff ${kind} ${day} → ${n}`);
      }
    }

    // keep weekly bazar duties created ahead even if nobody opens the app
    await admin.rpc("ensure_weekly_duty", { p_mess: mess.id });
    await admin.rpc("ensure_recurring_bills", { p_mess: mess.id });

    // 2) bazar duty reminder the evening before
    if (mess.duty_reminder_time !== null && minutes >= mess.duty_reminder_time) {
      const tomorrow = addDays(today, 1);
      const { data: duties } = await admin
        .from("bazar_roster")
        .select("member_id")
        .eq("mess_id", mess.id)
        .eq("date", tomorrow)
        .eq("done", false);
      if (duties?.length && (await claim(admin, mess.id, "duty", tomorrow))) {
        const ids = new Set(duties.map((d) => d.member_id));
        const n = await pushToUsers(members.filter((x) => ids.has(x.id)).map((x) => x.user_id), "duty", (t, { locale }) => ({
          title: t("push.dutyTitle"),
          body: t("push.dutyBody", { date: fmtDate(locale, tomorrow, { weekday: "long", day: "numeric", month: "long" }) }),
          url: `/${locale}/roster`,
          tag: "duty",
        }));
        log.push(`${mess.name}: duty ${tomorrow} → ${n}`);
      }
    }

    // 4) meal money almost finished / finished - checked once a day; each member hears once per level per month
    if (minutes >= MEAL_MONEY_FROM && (await claim(admin, mess.id, "mealmoney-check", today))) {
      const month = monthStart(today);
      const [summary, { data: mealRows }, { data: depRows }] = await Promise.all([
        getMonthSummary(admin, mess.id, month),
        admin.from("meals").select("*").eq("mess_id", mess.id).gte("date", month).lte("date", today),
        admin.from("deposits").select("member_id, date, amount").eq("mess_id", mess.id).eq("status", "approved").gte("date", month).lte("date", today),
      ]);
      let sent = 0;
      for (const member of members) {
        const row = summary.members.find((x) => x.member_id === member.id);
        if (!row) continue;
        const mealsByDay: Record<string, number> = {};
        for (const r of (mealRows ?? []) as Meal[]) if (r.member_id === member.id) mealsByDay[r.date] = weightedMeals(mess, r);
        const w = mealWallet({
      lowDays: mess.low_meal_days,
          month, monthEnd: monthEnd(month), today, rate: summary.meal_rate, bills: row.fixed_share, carry: row.carry_in, balance: row.balance,
          deposits: (depRows ?? []).filter((d) => d.member_id === member.id), mealsByDay,
        });
        if (w.status !== "low" && w.status !== "out") continue;
        if (!(await claim(admin, mess.id, "mealmoney", `${month}:${member.id}:${w.status}`))) continue;
        sent += await pushToUsers([member.user_id], "dues", (t, { locale }) => ({
          title: w.status === "out" ? t("push.mealOutTitle") : t("push.mealLowTitle"),
          body:
            w.status === "out"
              ? t("push.mealOutBody", { owe: fmtMoney(locale, Math.abs(w.left)), pay: fmtMoney(locale, w.suggest) })
              : t("push.mealLowBody", { days: Math.floor(w.daysLeft ?? 0), left: fmtMoney(locale, w.left), pay: fmtMoney(locale, w.suggest) }),
          url: `/${locale}/members/${member.id}`,
          tag: "meal-money",
        }));
        // the people who collect money hear about it too (not the member themself)
        const collectors = (await usersWithPerm(mess.id, "deposits")).filter((id) => id !== member.user_id);
        sent += await pushToUsers(collectors, "deposits", (t, { locale }) => ({
          title: w.status === "out" ? t("push.mealOutMgrTitle", { name: member.display_name }) : t("push.mealLowMgrTitle", { name: member.display_name }),
          body:
            w.status === "out"
              ? t("push.mealOutMgrBody", { name: member.display_name, owe: fmtMoney(locale, Math.abs(w.left)), pay: fmtMoney(locale, w.suggest) })
              : t("push.mealLowMgrBody", { name: member.display_name, days: Math.floor(w.daysLeft ?? 0), pay: fmtMoney(locale, w.suggest) }),
          url: `/${locale}/members/${member.id}`,
          tag: `meal-money-${member.id}`,
        }));
      }
      log.push(`${mess.name}: meal money → ${sent}`);
    }

    // 3) weekly dues reminder
    if (mess.dues_reminder_day !== null && weekday === mess.dues_reminder_day && minutes >= mess.dues_reminder_time && (await claim(admin, mess.id, "dues", today))) {
      const n = (await sendDueReminders(admin, mess)).filter((r) => r.sent).length;
      log.push(`${mess.name}: dues → ${n}`);
    }
  }
  return { ok: true, log };
}

export type DueReach = "app" | "notifications_off" | "no_app";
export type DueResult = { member_id: string; name: string; amount: number; phone: string | null; reach: DueReach; sent: boolean };

/** Members who owe this month, and whether a push can reach each of them. */
export async function getDueReach(admin: SupabaseClient, mess: Mess) {
  const [summary, { data: members }] = await Promise.all([
    getMonthSummary(admin, mess.id, monthStart(todayDhaka())),
    admin.from("mess_members").select("id, user_id, phone").eq("mess_id", mess.id),
  ]);
  const owing = summary.members.filter((x) => x.balance <= -1);
  const byId = new Map((members ?? []).map((m) => [m.id as string, m as { id: string; user_id: string | null; phone: string | null }]));
  const userIds = owing.map((x) => byId.get(x.member_id)?.user_id).filter((x): x is string => !!x);
  const { data: profiles } = userIds.length
    ? await admin.from("profiles").select("id, notify_prefs, push_subscriptions(id)").in("id", userIds)
    : { data: [] };
  const reachable = new Set(
    ((profiles ?? []) as { id: string; notify_prefs: Record<string, boolean> | null; push_subscriptions: unknown[] }[])
      .filter((p) => p.push_subscriptions.length > 0 && p.notify_prefs?.dues !== false)
      .map((p) => p.id),
  );
  return owing
    .map((x): DueResult => {
      const m = byId.get(x.member_id);
      const reach: DueReach = !m?.user_id ? "no_app" : reachable.has(m.user_id) ? "app" : "notifications_off";
      return { member_id: x.member_id, name: x.display_name, amount: -x.balance, phone: m?.phone ?? null, reach, sent: false };
    })
    .sort((a, b) => b.amount - a.amount);
}

/**
 * Push a "you owe" reminder. `note` (from the manager) is added under the amount;
 * `onlyMembers` limits it to the members picked in the dialog. Returns per-member results.
 */
export async function sendDueReminders(admin: SupabaseClient, mess: Mess, opts: { note?: string; onlyMembers?: string[] } = {}) {
  const note = opts.note?.trim().slice(0, 200) || "";
  const rows = (await getDueReach(admin, mess)).filter((r) => !opts.onlyMembers || opts.onlyMembers.includes(r.member_id));
  const { data: members } = await admin.from("mess_members").select("id, user_id").in("id", rows.map((r) => r.member_id));
  const userOf = new Map((members ?? []).map((m) => [m.id as string, m.user_id as string | null]));
  const memberOfUser = new Map([...userOf].filter(([, u]) => u).map(([m, u]) => [u as string, m]));
  const delivered = new Set<string>();
  await pushToUsers(
    rows.map((r) => userOf.get(r.member_id)),
    "dues",
    (t, { userId, locale }) => {
      const row = rows.find((r) => r.member_id === memberOfUser.get(userId))!;
      const body = t("push.duesBody", { amount: fmtMoney(locale, row.amount), mess: mess.name });
      return { title: t("push.duesTitle"), body: note ? `${body}\n📝 ${note}` : body, url: `/${locale}/deposits`, tag: "dues" };
    },
    (userId) => delivered.add(memberOfUser.get(userId)!),
  );
  return rows.map((r) => ({ ...r, sent: delivered.has(r.member_id) }));
}

// ---------------------------------------------------------------- events
export async function notifyDepositReviewed(depositId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("deposits")
    .select("amount, status, method, member:mess_members(user_id)")
    .eq("id", depositId)
    .single();
  if (!data) return;
  const d = data as unknown as { amount: number; status: string; method: PaymentMethod; member: { user_id: string | null } };
  await pushToUsers([d.member.user_id], "deposits", (t, { locale }) => ({
    title: d.status === "approved" ? t("push.depositApprovedTitle") : t("push.depositRejectedTitle"),
    body: t("push.depositBody", { amount: fmtMoney(locale, d.amount), method: t(`methods.${d.method}`) }),
    url: `/${locale}/deposits`,
    tag: `deposit-${depositId}`,
  }));
}

/** Account ids of active members who hold a permission (managers always do). */
async function usersWithPerm(messId: string, perm: Permission) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("mess_members")
    .select("user_id, role, mess_role:mess_roles(permissions)")
    .eq("mess_id", messId)
    .eq("status", "active")
    .not("user_id", "is", null);
  const rows = (data ?? []) as unknown as { user_id: string; role: string; mess_role: { permissions: string[] } | null }[];
  return rows.filter((r) => r.role === "manager" || r.mess_role?.permissions.includes(perm)).map((r) => r.user_id);
}

export async function notifyDepositSubmitted(messId: string, memberName: string, amount: number, method: PaymentMethod) {
  await pushToUsers(await usersWithPerm(messId, "deposits"), "deposits", (t, { locale }) => ({
    title: t("push.depositPendingTitle"),
    body: t("push.depositPendingBody", { name: memberName, amount: fmtMoney(locale, amount), method: t(`methods.${method}`) }),
    url: `/${locale}/deposits`,
    tag: "deposit-pending",
  }));
}

export async function notifyJoinRequest(messId: string, name: string) {
  await pushToUsers(await usersWithPerm(messId, "members"), "notices", (t, { locale }) => ({
    title: t("push.joinRequestTitle"),
    body: t("push.joinRequestBody", { name }),
    url: `/${locale}/members`,
    tag: "join-request",
  }));
}

/** New-mess request → every super admin. */
export async function notifyMessRequest(name: string, requester: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("profiles").select("id").eq("is_super_admin", true);
  await pushToUsers((data ?? []).map((p) => p.id), null, (t, { locale }) => ({
    title: t("push.messRequestTitle"),
    body: t("push.messRequestBody", { name: requester, mess: name }),
    url: `/${locale}/admin`,
    tag: "mess-request",
  }));
}

/** Tell the requester their join / new-mess request was approved. */
export async function notifyApproved(userId: string, messName: string, kind: "join" | "mess") {
  await pushToUsers([userId], null, (t, { locale }) => ({
    title: t("push.approvedTitle"),
    body: kind === "join" ? t("push.joinApprovedBody", { mess: messName }) : t("push.messApprovedBody", { mess: messName }),
    url: `/${locale}/dashboard`,
    tag: "approved",
  }));
}

export async function notifyNotice(messId: string, authorUserId: string, title: string, body: string | null) {
  const admin = createAdminClient();
  const { data } = await admin.from("mess_members").select("user_id").eq("mess_id", messId).eq("status", "active");
  await pushToUsers(
    (data ?? []).map((x) => x.user_id).filter((id) => id !== authorUserId),
    "notices",
    (t, { locale }) => ({
      title: `📢 ${title}`,
      body: body?.slice(0, 180) || t("push.noticeBody"),
      url: `/${locale}/notices`,
      tag: "notice",
    }),
  );
}

export async function notifySwap(otherMemberId: string, swapperName: string, newDate: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("mess_members").select("user_id").eq("id", otherMemberId).single();
  await pushToUsers([data?.user_id], "duty", (t, { locale }) => ({
    title: t("push.swapTitle"),
    body: t("push.swapBody", {
      name: swapperName,
      date: fmtDate(locale, newDate, { weekday: "long", day: "numeric", month: "long" }),
    }),
    url: `/${locale}/roster`,
    tag: "duty-swap",
  }));
}
