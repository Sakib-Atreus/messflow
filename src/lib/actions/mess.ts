"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { cookies } from "next/headers";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContext, getSession, MESS_COOKIE } from "@/lib/mess";
import { toErrorKey, type ActionResult } from "@/lib/errors";
import { isValidDate, monthStart, todayDhaka } from "@/lib/dates";
import type { DepositStatus, MealKind, PaymentMethod } from "@/lib/types";
import { notifyDepositReviewed, notifyDepositSubmitted, notifyJoinRequest, notifyMessRequest } from "@/lib/notify";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string) => Number(String(fd.get(k) ?? "").replace(/,/g, ""));
const bool = (fd: FormData, k: string) => fd.get(k) === "on" || fd.get(k) === "true";
const date = (fd: FormData, k: string) => {
  const v = str(fd, k);
  return isValidDate(v) ? v : todayDhaka();
};
const done = (extra: Partial<ActionResult> = {}): ActionResult => {
  revalidatePath("/", "layout");
  return { ok: true, ...extra };
};

async function setMessCookie(messId: string) {
  (await cookies()).set(MESS_COOKIE, messId, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
}

// ---------------------------------------------------------------- onboarding
/** Self sign-ups ask the super admin for a new mess. */
export async function requestMess(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const name = str(fd, "name");
  if (!name) return { error: "INVALID_INPUT" };
  const { error } = await supabase.rpc("request_mess", {
    p_name: name,
    p_address: str(fd, "address") || null,
    p_display_name: str(fd, "display_name") || null,
  });
  if (error) return { error: toErrorKey(error) };
  const requester = str(fd, "display_name") || name;
  after(() => notifyMessRequest(name, requester));
  return { ...done(), message: "onboarding.requestSent" };
}

/** Invite code → join request for the manager; claim code → linked straight away. */
export async function joinMess(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("join_mess", {
    p_code: str(fd, "code"),
    p_display_name: str(fd, "display_name") || null,
  });
  if (error) return { error: toErrorKey(error) };
  if (!data) {
    const { data: req } = await supabase
      .from("join_requests")
      .select("mess_id, display_name")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (req) after(() => notifyJoinRequest(req.mess_id, req.display_name));
    return { ...done(), message: "onboarding.requestSent" };
  }
  await setMessCookie(data as string);
  return redirect({ href: "/dashboard", locale: await getLocale() });
}

export async function switchMess(messId: string) {
  await setMessCookie(messId);
  revalidatePath("/", "layout");
}

// ---------------------------------------------------------------- meals
export async function setMeal(
  memberId: string,
  day: string,
  patch: Partial<Record<MealKind, boolean>> & Partial<Record<`guest_${MealKind}`, number>>,
): Promise<ActionResult> {
  const { supabase } = await getContext();
  if (!isValidDate(day)) return { error: "INVALID_INPUT" };
  const { error } = await supabase.rpc("set_meal", {
    p_member: memberId,
    p_date: day,
    p_breakfast: patch.breakfast ?? null,
    p_lunch: patch.lunch ?? null,
    p_dinner: patch.dinner ?? null,
    p_guest_breakfast: patch.guest_breakfast ?? null,
    p_guest_lunch: patch.guest_lunch ?? null,
    p_guest_dinner: patch.guest_dinner ?? null,
  });
  if (error) return { error: toErrorKey(error) };
  return done();
}

export async function setMealHalf(memberId: string, day: string, kind: MealKind, half: boolean): Promise<ActionResult> {
  const { supabase } = await getContext();
  if (!isValidDate(day)) return { error: "INVALID_INPUT" };
  const { error } = await supabase.rpc("set_meal_half", { p_member: memberId, p_date: day, p_kind: kind, p_half: half });
  if (error) return { error: toErrorKey(error) };
  return done();
}

export async function setMealRange(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, me, can } = await getContext();
  const isStaff = can("meals");
  const memberId = isStaff && str(fd, "member_id") ? str(fd, "member_id") : me.id;
  const on = str(fd, "mode") === "on";
  const pick = (k: MealKind) => (bool(fd, k) ? on : null);
  const { error } = await supabase.rpc("set_meal_range", {
    p_member: memberId,
    p_from: date(fd, "from"),
    p_to: date(fd, "to"),
    p_breakfast: pick("breakfast"),
    p_lunch: pick("lunch"),
    p_dinner: pick("dinner"),
  });
  if (error) return { error: toErrorKey(error) };
  return done();
}

export async function updateMyDefaults(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, mess } = await getContext();
  const { error } = await supabase.rpc("update_my_defaults", {
    p_mess: mess.id,
    p_breakfast: bool(fd, "breakfast"),
    p_lunch: bool(fd, "lunch"),
    p_dinner: bool(fd, "dinner"),
  });
  if (error) return { error: toErrorKey(error) };
  return done();
}

// ---------------------------------------------------------------- bazar
export async function addBazar(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, mess, user } = await getContext();
  const amount = num(fd, "amount");
  if (!(amount > 0)) return { error: "INVALID_INPUT" };
  const { error } = await supabase.from("bazar_entries").insert({
    mess_id: mess.id,
    date: date(fd, "date"),
    amount,
    shopper_id: str(fd, "shopper_id") || null,
    items: str(fd, "items") || null,
    created_by: user.id,
  });
  if (error) return { error: toErrorKey(error) };
  return done();
}

export async function deleteBazar(id: string): Promise<ActionResult> {
  const { supabase } = await getContext();
  const { error } = await supabase.from("bazar_entries").delete().eq("id", id);
  if (error) return { error: toErrorKey(error) };
  return done();
}

// ---------------------------------------------------------------- deposits
export async function addDeposit(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, mess, me, user, can } = await getContext();
  const isStaff = can("deposits");
  const amount = num(fd, "amount");
  if (!(amount > 0)) return { error: "INVALID_INPUT" };
  const { error } = await supabase.from("deposits").insert({
    mess_id: mess.id,
    member_id: isStaff && str(fd, "member_id") ? str(fd, "member_id") : me.id,
    date: date(fd, "date"),
    amount,
    method: (str(fd, "method") || "cash") as PaymentMethod,
    txn_id: str(fd, "txn_id") || null,
    note: str(fd, "note") || null,
    status: isStaff ? "approved" : "pending",
    created_by: user.id,
    reviewed_by: isStaff ? user.id : null,
    reviewed_at: isStaff ? new Date().toISOString() : null,
  });
  if (error) return { error: toErrorKey(error) };
  if (!isStaff) {
    const method = (str(fd, "method") || "cash") as PaymentMethod;
    after(() => notifyDepositSubmitted(mess.id, me.display_name, amount, method));
  }
  return done();
}

export async function reviewDeposit(id: string, status: Exclude<DepositStatus, "pending">): Promise<ActionResult> {
  const { supabase, user } = await getContext();
  const { error } = await supabase
    .from("deposits")
    .update({ status, reviewed_by: user.id, reviewed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: toErrorKey(error) };
  after(() => notifyDepositReviewed(id));
  return done();
}

export async function deleteDeposit(id: string): Promise<ActionResult> {
  const { supabase } = await getContext();
  const { error, count } = await supabase.from("deposits").delete({ count: "exact" }).eq("id", id);
  if (error) return { error: toErrorKey(error) };
  if (!count) return { error: "FORBIDDEN" };
  return done();
}

// ---------------------------------------------------------------- fixed costs
export async function addFixedCost(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, mess } = await getContext();
  const split = str(fd, "split") === "custom" ? "custom" : "equal";
  const amount = num(fd, "amount");
  let shares: { member_id: string; amount: number }[] | null = null;
  if (split === "custom") {
    shares = [];
    for (const [k, v] of fd.entries()) {
      if (k.startsWith("share_") && Number(v) > 0) shares.push({ member_id: k.slice(6), amount: Number(v) });
    }
  }
  const total = split === "custom" ? shares!.reduce((a, s) => a + s.amount, 0) : amount;
  if (!(total > 0) || !str(fd, "title")) return { error: "INVALID_INPUT" };
  const { data: costId, error } = await supabase.rpc("add_fixed_cost", {
    p_mess: mess.id,
    p_month: monthStart(date(fd, "month")),
    p_category: str(fd, "category"),
    p_title: str(fd, "title"),
    p_amount: Math.round(total * 100) / 100,
    p_split: split,
    p_shares: shares,
  });
  if (error) return { error: toErrorKey(error) };
  if (bool(fd, "repeat_monthly") && costId) await supabase.from("fixed_costs").update({ repeat_monthly: true }).eq("id", costId as string);
  return done();
}

/** Turn "copy this bill into every new month" on or off. */
export async function setBillRepeat(id: string, repeat: boolean): Promise<ActionResult> {
  const { supabase, can } = await getContext();
  if (!can("costs")) return { error: "FORBIDDEN" };
  const { error } = await supabase.from("fixed_costs").update({ repeat_monthly: repeat }).eq("id", id);
  if (error) return { error: toErrorKey(error) };
  return done({ message: repeat ? "costs.repeatOn" : "costs.repeatOff" });
}

export async function deleteFixedCost(id: string): Promise<ActionResult> {
  const { supabase } = await getContext();
  const { error, count } = await supabase.from("fixed_costs").delete({ count: "exact" }).eq("id", id);
  if (error) return { error: toErrorKey(error) };
  if (!count) return { error: "FORBIDDEN" };
  return done();
}

// ---------------------------------------------------------------- months
export async function closeMonth(month: string): Promise<ActionResult> {
  const { supabase, mess } = await getContext();
  const { error } = await supabase.rpc("close_month", { p_mess: mess.id, p_month: month });
  if (error) return { error: toErrorKey(error) };
  return done();
}

export async function reopenMonth(month: string): Promise<ActionResult> {
  const { supabase, mess } = await getContext();
  const { error } = await supabase.rpc("reopen_month", { p_mess: mess.id, p_month: month });
  if (error) return { error: toErrorKey(error) };
  return done();
}

// ---------------------------------------------------------------- settings
const toInterval = (hhmm: string, prevDay = false) => {
  const [h, m] = (hhmm || "00:00").split(":").map(Number);
  if (prevDay) {
    // a breakfast cutoff like 23:00 means "the night before" → -01:00
    const mins = h * 60 + m - 24 * 60;
    const a = Math.abs(mins);
    return `-${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
  }
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

/** "20:30" → 1230 */
const hhmmToMin = (v: string, fallback: number) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v);
  return m ? Math.min(1439, Number(m[1]) * 60 + Number(m[2])) : fallback;
};

export async function updateMessSettings(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, mess } = await getContext();
  const { error } = await supabase
    .from("messes")
    .update({
      name: str(fd, "name"),
      address: str(fd, "address") || null,
      breakfast_enabled: bool(fd, "breakfast_enabled"),
      breakfast_weight: num(fd, "breakfast_weight"),
      lunch_weight: num(fd, "lunch_weight"),
      dinner_weight: num(fd, "dinner_weight"),
      breakfast_cutoff: toInterval(str(fd, "breakfast_cutoff"), bool(fd, "breakfast_prev_day")),
      lunch_cutoff: toInterval(str(fd, "lunch_cutoff")),
      dinner_cutoff: toInterval(str(fd, "dinner_cutoff")),
      meal_rate_rounding: str(fd, "meal_rate_rounding") === "sheet" ? "sheet" : "exact",
      low_meal_days: Math.min(5, Math.max(2, Number(str(fd, "low_meal_days")) || 3)),
      dues_reminder_day: str(fd, "dues_reminder_day") === "off" ? null : Math.min(6, Math.max(0, Number(str(fd, "dues_reminder_day")) || 0)),
      dues_reminder_time: hhmmToMin(str(fd, "dues_reminder_time"), 600),
      duty_reminder_time: str(fd, "duty_reminder_on") === "on" ? hhmmToMin(str(fd, "duty_reminder_time"), 1200) : null,
      cutoff_reminder_min: ["30", "45", "60"].includes(str(fd, "cutoff_reminder_min")) ? Number(str(fd, "cutoff_reminder_min")) : null,
      new_member_breakfast: bool(fd, "new_member_breakfast"),
      new_member_lunch: bool(fd, "new_member_lunch"),
      new_member_dinner: bool(fd, "new_member_dinner"),
    })
    .eq("id", mess.id);
  if (error) return { error: toErrorKey(error) };
  return done();
}

export async function regenerateInvite(): Promise<ActionResult> {
  const { supabase, mess } = await getContext();
  const { error } = await supabase.rpc("regenerate_invite_code", { p_mess: mess.id });
  if (error) return { error: toErrorKey(error) };
  return done();
}

export async function updateProfileLocale(locale: "bn" | "en") {
  // must not redirect: it's also called from the login/onboarding pages
  const { supabase, user } = await getSession();
  if (user) await supabase.from("profiles").update({ locale }).eq("id", user.id);
}
