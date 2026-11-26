import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Things waiting for this person, keyed by the page where they're handled. */
export type Pending = { "/members": number; "/deposits": number; "/admin": number; "/meals": number };

export const getPending = cache(
  async (supabase: SupabaseClient, messId: string | null, can: { members: boolean; deposits: boolean; superAdmin: boolean; manager?: boolean }): Promise<Pending> => {
    const count = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;
    const [members, deposits, admin, cooks] = await Promise.all([
      can.members && messId
        ? count(supabase.from("join_requests").select("id", { count: "exact", head: true }).eq("mess_id", messId).eq("status", "pending"))
        : 0,
      can.deposits && messId
        ? count(supabase.from("deposits").select("id", { count: "exact", head: true }).eq("mess_id", messId).eq("status", "pending"))
        : 0,
      can.superAdmin
        ? count(supabase.from("mess_requests").select("id", { count: "exact", head: true }).eq("status", "pending"))
        : 0,
      // "I'll cook" offers for khala's leave days
      can.manager && messId
        ? count(supabase.from("cook_volunteers").select("id", { count: "exact", head: true }).eq("mess_id", messId).eq("status", "pending"))
        : 0,
    ]);
    return { "/members": members, "/deposits": deposits, "/admin": admin, "/meals": cooks };
  },
);
