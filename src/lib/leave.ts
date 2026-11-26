import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MealKind } from "@/lib/types";

export type CookOffer = { id: string; member_id: string; status: "pending" | "approved" | "rejected"; name: string };
export type CookLeave = { id: string; date: string; meal: MealKind; offers: CookOffer[] };

/** Khala's leave days between two dates, with the "I'll cook" offers. */
export async function getLeaves(supabase: SupabaseClient, messId: string, from: string, to: string): Promise<CookLeave[]> {
  const { data } = await supabase
    .from("cook_leaves")
    .select("id, date, meal, cook_volunteers(id, member_id, status, member:mess_members(display_name))")
    .eq("mess_id", messId)
    .gte("date", from)
    .lte("date", to)
    .order("date")
    .order("meal");
  const order: MealKind[] = ["breakfast", "lunch", "dinner"];
  return ((data ?? []) as unknown as {
    id: string; date: string; meal: MealKind;
    cook_volunteers: { id: string; member_id: string; status: CookOffer["status"]; member: { display_name: string } | null }[];
  }[])
    .map((l) => ({
      id: l.id,
      date: l.date,
      meal: l.meal,
      offers: l.cook_volunteers.map((v) => ({ id: v.id, member_id: v.member_id, status: v.status, name: v.member?.display_name ?? "" })),
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || order.indexOf(a.meal) - order.indexOf(b.meal));
}

/** Meals that are off because of khala's leave and nobody is approved to cook yet. */
export function closedByLeave(leaves: CookLeave[]) {
  const closed = new Set(leaves.filter((l) => !l.offers.some((o) => o.status === "approved")).map((l) => `${l.date}:${l.meal}`));
  return (date: string, kind: MealKind) => closed.has(`${date}:${kind}`);
}
