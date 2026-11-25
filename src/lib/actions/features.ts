"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getContext, getSession } from "@/lib/mess";
import { createAdminClient } from "@/lib/supabase/server";
import { toErrorKey, type ActionResult } from "@/lib/errors";
import { isValidDate } from "@/lib/dates";
import { notifyNotice, notifySwap, sendDueReminders, type DueResult } from "@/lib/notify";
import { pushEnabled, pushToUsers, type NotifyPrefs } from "@/lib/push";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const done = (): ActionResult => {
  revalidatePath("/", "layout");
  return { ok: true };
};

// ---------------------------------------------------------------- bazar duty roster
export async function generateRoster(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, mess } = await getContext();
  const members = fd.getAll("members").map(String);
  const start = str(fd, "start_with");
  // rotate so the chosen person goes first
  const i = Math.max(0, members.indexOf(start));
  const ordered = [...members.slice(i), ...members.slice(0, i)];
  const from = str(fd, "from");
  const to = str(fd, "to");
  if (!ordered.length || !isValidDate(from) || !isValidDate(to)) return { error: "INVALID_INPUT" };
  const { error } = await supabase.rpc("generate_roster", {
    p_mess: mess.id,
    p_members: ordered,
    p_from: from,
    p_to: to,
    p_every: Math.max(1, Number(str(fd, "every")) || 1),
    p_per_turn: Math.max(1, Number(str(fd, "per_turn")) || 1),
  });
  if (error) return { error: toErrorKey(error) };
  return done();
}

/** Weekly plan: fields wd_<weekday>_a / wd_<weekday>_b (member ids, optional), from = start date. */
export async function saveWeeklyDuty(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, mess, can } = await getContext();
  if (!can("roster")) return { error: "FORBIDDEN" };
  const plan: { weekday: number; member_id: string }[] = [];
  for (let wd = 0; wd <= 6; wd++) {
    for (const slot of ["a", "b"]) {
      const id = str(fd, `wd_${wd}_${slot}`);
      if (id && !plan.some((p) => p.weekday === wd && p.member_id === id)) plan.push({ weekday: wd, member_id: id });
    }
  }
  const from = str(fd, "from");
  const { error } = await supabase.rpc("save_weekly_duty", { p_mess: mess.id, p_plan: plan, p_from: isValidDate(from) ? from : null });
  if (error) return { error: toErrorKey(error) };
  return done();
}

export async function assignDuty(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, mess } = await getContext();
  const date = str(fd, "date");
  if (!isValidDate(date) || !str(fd, "member_id")) return { error: "INVALID_INPUT" };
  const { error } = await supabase.from("bazar_roster").insert({ mess_id: mess.id, date, member_id: str(fd, "member_id") });
  if (error) return { error: error.code === "23505" ? "DUTY_CONFLICT" : toErrorKey(error) };
  return done();
}

export async function deleteDuty(id: string): Promise<ActionResult> {
  const { supabase } = await getContext();
  const { error, count } = await supabase.from("bazar_roster").delete({ count: "exact" }).eq("id", id);
  if (error) return { error: toErrorKey(error) };
  if (!count) return { error: "FORBIDDEN" };
  return done();
}

export async function setDutyDone(id: string, value: boolean): Promise<ActionResult> {
  const { supabase } = await getContext();
  const { error, count } = await supabase.from("bazar_roster").update({ done: value }, { count: "exact" }).eq("id", id);
  if (error) return { error: toErrorKey(error) };
  if (!count) return { error: "FORBIDDEN" };
  return done();
}

export async function swapDuty(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, me } = await getContext();
  const a = str(fd, "mine");
  const b = str(fd, "other");
  if (!a || !b) return { error: "INVALID_INPUT" };
  const { data: before } = await supabase.from("bazar_roster").select("id, date, member_id").in("id", [a, b]);
  const { error } = await supabase.rpc("swap_duty", { p_a: a, p_b: b });
  if (error) return { error: toErrorKey(error) };
  const mine = before?.find((x) => x.id === a);
  const other = before?.find((x) => x.id === b);
  if (mine && other && other.member_id !== me.id) {
    // the other person now has my old date
    after(() => notifySwap(other.member_id, me.display_name, mine.date));
  }
  return done();
}

// ---------------------------------------------------------------- notices
export async function addNotice(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, mess, user } = await getContext();
  const title = str(fd, "title");
  const body = str(fd, "body") || null;
  if (!title) return { error: "INVALID_INPUT" };
  const { error } = await supabase
    .from("notices")
    .insert({ mess_id: mess.id, title, body, pinned: fd.get("pinned") === "on", created_by: user.id });
  if (error) return { error: toErrorKey(error) };
  if (fd.get("notify") === "on") after(() => notifyNotice(mess.id, user.id, title, body));
  return done();
}

export async function deleteNotice(id: string): Promise<ActionResult> {
  const { supabase } = await getContext();
  const { error, count } = await supabase.from("notices").delete({ count: "exact" }).eq("id", id);
  if (error) return { error: toErrorKey(error) };
  if (!count) return { error: "FORBIDDEN" };
  return done();
}

export async function setNoticePinned(id: string, pinned: boolean): Promise<ActionResult> {
  const { supabase } = await getContext();
  const { error, count } = await supabase.from("notices").update({ pinned }, { count: "exact" }).eq("id", id);
  if (error) return { error: toErrorKey(error) };
  if (!count) return { error: "FORBIDDEN" };
  return done();
}

// ---------------------------------------------------------------- push notifications
export async function saveSubscription(
  sub: { endpoint?: string; keys?: { p256dh?: string; auth?: string } },
  userAgent: string,
): Promise<ActionResult> {
  const { user } = await getSession();
  if (!user) return { error: "NOT_AUTHENTICATED" };
  if (!sub.endpoint?.startsWith("https://") || !sub.keys?.p256dh || !sub.keys?.auth) return { error: "INVALID_INPUT" };
  // A device's endpoint is unique; if someone else logged in on this phone before, move it to the current user.
  const admin = createAdminClient();
  await admin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
  const { error } = await admin.from("push_subscriptions").insert({
    user_id: user.id,
    endpoint: sub.endpoint,
    p256dh: sub.keys.p256dh,
    auth: sub.keys.auth,
    user_agent: userAgent.slice(0, 300),
  });
  if (error) return { error: toErrorKey(error) };
  return { ok: true };
}

export async function removeSubscription(endpoint: string): Promise<ActionResult> {
  const { supabase, user } = await getSession();
  if (!user) return { error: "NOT_AUTHENTICATED" };
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  return { ok: true };
}

export async function updateNotifyPrefs(prefs: NotifyPrefs): Promise<ActionResult> {
  const { supabase, user } = await getSession();
  if (!user) return { error: "NOT_AUTHENTICATED" };
  const clean = Object.fromEntries(
    (["cutoff", "duty", "dues", "notices", "deposits"] as const).map((k) => [k, prefs[k] !== false]),
  );
  const { error } = await supabase.from("profiles").update({ notify_prefs: clean }).eq("id", user.id);
  if (error) return { error: toErrorKey(error) };
  return { ok: true };
}

export async function sendTestPush(): Promise<ActionResult> {
  const { user } = await getSession();
  if (!user) return { error: "NOT_AUTHENTICATED" };
  if (!pushEnabled()) return { error: "UNKNOWN" };
  const n = await pushToUsers([user.id], null, (t) => ({ title: t("app.name"), body: t("push.testBody"), tag: "test" }));
  return n > 0 ? { ok: true } : { error: "UNKNOWN" };
}

export async function remindDues(input: { note: string; memberIds: string[] }): Promise<ActionResult & { results?: DueResult[] }> {
  const { mess, can } = await getContext();
  if (!can("deposits")) return { error: "FORBIDDEN" };
  if (!input.memberIds.length) return { error: "INVALID_INPUT" };
  const results = await sendDueReminders(createAdminClient(), mess, { note: input.note, onlyMembers: input.memberIds });
  return { ok: true, results };
}

/** The bell was opened: everything in my inbox counts as read. */
export async function markInboxRead(): Promise<void> {
  const { supabase, user } = await getSession();
  if (!user) return;
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null);
}
