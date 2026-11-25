import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { displayLogin, loginToEmail, tempPassword } from "@/lib/login-id";
import type { ErrorKey } from "@/lib/errors";

type NewAccount = { login: string; password?: string; fullName: string; phone?: string | null; locale?: string };
type Created = { id: string; login: string; password: string } | { error: ErrorKey };

/**
 * Creates a confirmed account with a temporary password (service role). The user must
 * change it on first login. Callers must check the requester's permission first.
 */
export async function createAccount({ login, password, fullName, phone, locale }: NewAccount): Promise<Created> {
  const email = loginToEmail(login);
  if (!email) return { error: "INVALID_USERNAME" };
  const pass = password?.trim() || tempPassword();
  if (pass.length < 6) return { error: "WEAK_PASSWORD" };
  const username = email.includes("@users.messflow.app") ? displayLogin(email) : null;

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: pass,
    email_confirm: true,
    user_metadata: { full_name: fullName, phone: phone || null, locale: locale === "en" ? "en" : "bn" },
    app_metadata: { must_change_password: true, username },
  });
  if (error || !data.user) {
    const msg = error?.message ?? "";
    if (/already|exists|registered/i.test(msg)) return { error: "LOGIN_TAKEN" };
    console.error("[messflow] createUser:", msg);
    return { error: "UNKNOWN" };
  }
  // Supabase attaches app_metadata after the signup trigger has run, so set the flags here
  await admin.from("profiles").update({ must_change_password: true, username }).eq("id", data.user.id);
  return { id: data.user.id, login: displayLogin(email), password: pass };
}

/** Super admin: set a new temporary password; the user must change it on next login. */
export async function resetPassword(userId: string, password?: string) {
  const pass = password?.trim() || tempPassword();
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.updateUserById(userId, { password: pass });
  if (error) return { error: "UNKNOWN" as ErrorKey };
  await admin.from("profiles").update({ must_change_password: true }).eq("id", userId);
  return { login: displayLogin(data.user.email), password: pass };
}

/** Super admin: block or unblock sign-in. */
export async function setBlocked(userId: string, blocked: boolean) {
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, { ban_duration: blocked ? "876000h" : "none" });
  return error ? { error: "UNKNOWN" as ErrorKey } : { ok: true };
}
