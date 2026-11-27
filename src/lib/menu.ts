import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MealKind } from "@/lib/types";

export type WeekDishes = Partial<Record<MealKind, string | null>>;
/** The menu people see for one day, and which meals came from the weekly menu. */
export type DayMenu = (WeekDishes & { note?: string | null; weekly?: Partial<Record<MealKind, boolean>> }) | null;

/** Saturday first, like the bazar roster. Numbers are JavaScript/Postgres weekdays (0 = Sunday). */
export const WEEK_ORDER = [6, 0, 1, 2, 3, 4, 5] as const;

/** Weekday number (0 = Sunday … 6 = Saturday) of a YYYY-MM-DD date. */
export const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

/** A day's menu: its own dishes where written, otherwise the weekly menu (merged in the database). */
export async function getDayMenu(supabase: SupabaseClient, messId: string, date: string): Promise<DayMenu> {
  const { data } = await supabase.rpc("menu_for_day", { p_mess: messId, p_date: date });
  return (data as DayMenu) ?? null;
}

/** Menus for each day from `from` to `to` (at most 14 days), in one call. */
export async function getMenusBetween(supabase: SupabaseClient, messId: string, from: string, to: string): Promise<{ date: string; menu: DayMenu }[]> {
  const { data } = await supabase.rpc("menus_between", { p_mess: messId, p_from: from, p_to: to });
  return (data as { date: string; menu: DayMenu }[] | null) ?? [];
}

/** Saturday of the week that contains `date` (weeks run Saturday → Friday). */
export const weekStartOf = (date: string) => {
  const back = (weekdayOf(date) + 1) % 7;
  return new Date(Date.parse(`${date}T00:00:00Z`) - back * 864e5).toISOString().slice(0, 10);
};

/** The whole weekly menu, by weekday number. */
export async function getWeeklyMenu(supabase: SupabaseClient, messId: string): Promise<Map<number, WeekDishes>> {
  const { data } = await supabase.from("weekly_menus").select("weekday, breakfast, lunch, dinner").eq("mess_id", messId);
  return new Map((data ?? []).map((r) => [r.weekday as number, { breakfast: r.breakfast, lunch: r.lunch, dinner: r.dinner }]));
}
