import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Meal, Member, MealKind, Mess, MonthSummary } from "./types";

export async function getMonthSummary(supabase: SupabaseClient, messId: string, month: string) {
  const { data, error } = await supabase.rpc("month_summary", { p_mess: messId, p_month: month });
  if (error) throw error;
  const s = data as MonthSummary;
  // numerics come back as JSON numbers; normalise just in case
  for (const k of ["total_bazar", "total_meals", "meal_rate", "total_fixed", "total_deposits"] as const) s[k] = Number(s[k]);
  s.members = s.members.map((m) => ({
    ...m,
    meals: Number(m.meals),
    meal_cost: Number(m.meal_cost),
    fixed_share: Number(m.fixed_share),
    deposits: Number(m.deposits),
    carry_in: Number(m.carry_in),
    balance: Number(m.balance),
  }));
  return s;
}

export async function getMembers(supabase: SupabaseClient, messId: string) {
  const { data } = await supabase.from("mess_members").select("*").eq("mess_id", messId).order("display_name");
  return (data ?? []) as Member[];
}

export const activeOn = (m: Member, date: string) => m.joined_on <= date && (!m.left_on || m.left_on >= date);

export function mealKinds(mess: Mess): MealKind[] {
  return mess.breakfast_enabled ? ["breakfast", "lunch", "dinner"] : ["lunch", "dinner"];
}

/** Effective meals for a member on a date: stored row, or their default pattern if no row yet. */
export function effectiveMeal(mess: Mess, m: Member, date: string, row?: Meal): Meal {
  if (row) return row;
  const active = activeOn(m, date);
  return {
    id: "",
    member_id: m.id,
    date,
    breakfast: active && mess.breakfast_enabled && m.default_breakfast,
    lunch: active && m.default_lunch,
    dinner: active && m.default_dinner,
    guest_breakfast: 0,
    guest_lunch: 0,
    guest_dinner: 0,
    half_breakfast: false,
    half_lunch: false,
    half_dinner: false,
    source: "auto",
  };
}

export async function getMealsBetween(supabase: SupabaseClient, messId: string, from: string, to: string) {
  const { data } = await supabase.from("meals").select("*").eq("mess_id", messId).gte("date", from).lte("date", to);
  return (data ?? []) as Meal[];
}

/** How much one member's meal counts: 0, ½ or 1 (guests separate). */
export const mealValue = (m: Meal, kind: MealKind) => (m[kind] ? (m[`half_${kind}`] ? 0.5 : 1) : 0);

/** Weighted meal count of one row, exactly as the monthly calculation does it. */
export function weightedMeals(mess: Mess, m: Meal) {
  return (["breakfast", "lunch", "dinner"] as const).reduce(
    (acc, k) => acc + (mealValue(m, k) + m[`guest_${k}`]) * Number(mess[`${k}_weight`]),
    0,
  );
}

export function countMeals(meals: Meal[], kind: MealKind) {
  return meals.reduce(
    (acc, m) => ({ members: acc.members + mealValue(m, kind), guests: acc.guests + m[`guest_${kind}`] }),
    { members: 0, guests: 0 },
  );
}

/** user id → profile picture URL, for the members of a mess who have an account */
export async function getAvatars(supabase: SupabaseClient, userIds: (string | null)[]) {
  const ids = [...new Set(userIds.filter((x): x is string => !!x))];
  if (!ids.length) return new Map<string, string>();
  const { data } = await supabase.from("profiles").select("id, avatar_url").in("id", ids).not("avatar_url", "is", null);
  return new Map((data ?? []).map((p) => [p.id as string, p.avatar_url as string]));
}
