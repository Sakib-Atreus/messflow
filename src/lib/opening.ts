import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Opening balances from the mess's old notebook (owes = negative, is owed = positive).
 * `locked` once the mess has closed any month: from then on they're part of a closed bill.
 */
export async function getOpening(supabase: SupabaseClient, messId: string) {
  const [{ data }, { count }] = await Promise.all([
    supabase.from("opening_balances").select("member_id, month, amount").eq("mess_id", messId),
    supabase.from("months").select("id", { count: "exact", head: true }).eq("mess_id", messId).eq("status", "closed"),
  ]);
  const rows = (data ?? []) as { member_id: string; month: string; amount: number }[];
  return {
    locked: (count ?? 0) > 0,
    /** the month the opening balances are carried into (null when none were entered) */
    month: rows[0]?.month ?? null,
    amounts: new Map(rows.map((r) => [r.member_id, Number(r.amount)])),
  };
}
