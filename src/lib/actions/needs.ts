"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getContext, getCook, requireUser } from "@/lib/mess";
import { toErrorKey, type ActionResult } from "@/lib/errors";
import { NEED_KEYS } from "@/lib/needs";
import { notifyNeeds } from "@/lib/notify";

/**
 * Khala (or the manager): ask for things to buy. Items are known keys (oil, salt…); `note` is free
 * text; `voice` is a file the browser already uploaded to the "voice" bucket under <mess id>/.
 */
export async function sendNeeds(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const cook = await getCook();
  let messId: string;
  if (cook) messId = cook.mess_id;
  else {
    const ctx = await getContext();
    if (!ctx.isManager) return { error: "FORBIDDEN" };
    messId = ctx.mess.id;
  }
  const items = [...new Set(fd.getAll("items").map(String))].filter((k) => NEED_KEYS.includes(k));
  const note = String(fd.get("note") ?? "").trim().slice(0, 300) || null;
  const voice = String(fd.get("voice") ?? "").trim() || null;
  if (!items.length && !note && !voice) return { error: "INVALID_INPUT" };
  const { error } = await supabase.rpc("add_bazar_needs", { p_mess: messId, p_items: items, p_note: note, p_voice: voice });
  if (error) return { error: toErrorKey(error) };
  after(() => notifyNeeds(messId, user.id, items, note, !!voice));
  revalidatePath("/", "layout");
  return { ok: true, message: "needs.sent" };
}

/** Anyone in the mess: "bought it". */
export async function markNeedBought(id: string): Promise<ActionResult> {
  const { supabase } = await getContext();
  const { error } = await supabase.rpc("mark_need_bought", { p_id: id });
  if (error) return { error: toErrorKey(error) };
  revalidatePath("/", "layout");
  return { ok: true, message: "needs.boughtDone" };
}
