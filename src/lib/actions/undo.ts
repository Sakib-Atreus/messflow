"use server";

import { revalidatePath } from "next/cache";
import { getContext } from "@/lib/mess";
import { toErrorKey, type ActionResult } from "@/lib/errors";

// Small deletes that can be undone for a few seconds instead of asking "Are you sure?"
const TABLE = { bazar: "bazar_entries", deposit: "deposits", notice: "notices" } as const;
export type UndoKind = keyof typeof TABLE;

export async function deleteWithUndo(kind: UndoKind, id: string): Promise<ActionResult> {
  const { supabase, mess } = await getContext();
  const { data, error } = await supabase.from(TABLE[kind]).delete().eq("id", id).eq("mess_id", mess.id).select("*");
  if (error) return { error: toErrorKey(error) };
  if (!data?.length) return { error: "FORBIDDEN" };
  revalidatePath("/", "layout");
  return { ok: true, undo: { kind, row: data[0] as Record<string, unknown> } };
}

/** Put a just-deleted row back exactly as it was (same id). The usual permissions apply. */
export async function restoreDeleted(kind: UndoKind, row: Record<string, unknown>): Promise<ActionResult> {
  const { supabase, mess } = await getContext();
  if (!(kind in TABLE) || row.mess_id !== mess.id) return { error: "FORBIDDEN" };
  const { error } = await supabase.from(TABLE[kind]).insert(row);
  if (error) return { error: toErrorKey(error) };
  revalidatePath("/", "layout");
  return { ok: true };
}
