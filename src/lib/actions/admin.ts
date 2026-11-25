"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { notifyApproved } from "@/lib/notify";
import { cookies } from "next/headers";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { MESS_COOKIE, requireUser } from "@/lib/mess";
import { createAccount, resetPassword, setBlocked } from "@/lib/accounts";
import { createAdminClient } from "@/lib/supabase/server";
import { loginToEmail } from "@/lib/login-id";
import { toErrorKey, type ActionResult } from "@/lib/errors";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const done = (extra: Partial<ActionResult> = {}): ActionResult => {
  revalidatePath("/", "layout");
  return { ok: true, ...extra };
};

/** Every action here re-checks the super admin flag from the database. */
async function superAdmin() {
  const ctx = await requireUser();
  if (!ctx.isSuperAdmin) throw new Error("FORBIDDEN");
  return ctx;
}

export async function reviewMessRequest(id: string, approve: boolean): Promise<ActionResult> {
  const { supabase } = await superAdmin();
  const { data: req } = await supabase.from("mess_requests").select("user_id, name").eq("id", id).maybeSingle();
  const { error } = await supabase.rpc("review_mess_request", { p_id: id, p_approve: approve });
  if (error) return { error: toErrorKey(error) };
  if (approve && req) after(() => notifyApproved(req.user_id, req.name, "mess"));
  return done();
}

/**
 * Create a mess and its manager. The manager is either an existing account (login matches)
 * or a new one with a temporary password.
 */
export async function createMessWithManager(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, locale } = await superAdmin();
  const name = str(fd, "name");
  const managerName = str(fd, "manager_name");
  const login = str(fd, "login");
  const email = loginToEmail(login);
  if (!name || !managerName || !email) return { error: email ? "INVALID_INPUT" : "INVALID_USERNAME" };

  const admin = createAdminClient();
  let managerId: string | null = null;
  let detail: string | undefined;
  // reuse an existing account if this login already exists
  const { data: existing } = await admin.rpc("find_user_by_email", { p_email: email }).maybeSingle<{ id: string }>();
  if (existing?.id) {
    managerId = existing.id;
  } else {
    const acc = await createAccount({ login, password: str(fd, "password"), fullName: managerName, phone: str(fd, "phone"), locale });
    if ("error" in acc) return { error: acc.error };
    managerId = acc.id;
    detail = `${acc.login}  ·  ${acc.password}`;
  }
  const { error } = await supabase.rpc("admin_create_mess", {
    p_name: name,
    p_address: str(fd, "address") || null,
    p_manager: managerId,
    p_display_name: managerName,
  });
  if (error) return { error: toErrorKey(error) };
  return done({ message: detail ? "admin.messCreatedLogin" : "admin.messCreated", detail });
}

export async function adminResetPassword(userId: string): Promise<ActionResult> {
  await superAdmin();
  const r = await resetPassword(userId);
  if ("error" in r) return { error: r.error };
  return done({ message: "admin.passwordReset", detail: `${r.login}  ·  ${r.password}` });
}

export async function adminResetPasswordForm(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return adminResetPassword(str(fd, "id"));
}

export async function adminSetBlocked(userId: string, blocked: boolean): Promise<ActionResult> {
  const { user } = await superAdmin();
  if (userId === user.id) return { error: "FORBIDDEN" };
  const r = await setBlocked(userId, blocked);
  if ("error" in r) return { error: r.error };
  return done();
}

export async function adminSetSuperAdmin(userId: string, value: boolean): Promise<ActionResult> {
  const { user } = await superAdmin();
  if (userId === user.id) return { error: "FORBIDDEN" }; // can't remove yourself
  const { error } = await createAdminClient().from("profiles").update({ is_super_admin: value }).eq("id", userId);
  if (error) return { error: toErrorKey(error) };
  return done();
}

export async function adminDeleteMess(messId: string): Promise<ActionResult> {
  await superAdmin();
  const admin = createAdminClient();
  // closed months are locked by a trigger; reopen them so the cascade can remove rows
  await admin.from("months").update({ status: "open" }).eq("mess_id", messId).eq("status", "closed");
  const { error } = await admin.from("messes").delete().eq("id", messId);
  if (error) return { error: toErrorKey(error) };
  return done();
}

/** Look at any mess with full rights. */
export async function openMess(messId: string) {
  await superAdmin();
  (await cookies()).set(MESS_COOKIE, messId, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  revalidatePath("/", "layout");
  return redirect({ href: "/dashboard", locale: await getLocale() });
}
