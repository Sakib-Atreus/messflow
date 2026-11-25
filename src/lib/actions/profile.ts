"use server";

import { revalidatePath } from "next/cache";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { getSession } from "@/lib/mess";
import { createAdminClient } from "@/lib/supabase/server";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase/env";
import { displayLogin, USERNAME_DOMAIN } from "@/lib/login-id";
import { toErrorKey, type ActionResult } from "@/lib/errors";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const done = (extra: Partial<ActionResult> = {}): ActionResult => {
  revalidatePath("/", "layout");
  return { ok: true, ...extra };
};

export async function updateProfile(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, user } = await getSession();
  if (!user) return { error: "NOT_AUTHENTICATED" };
  const name = str(fd, "full_name");
  if (!name) return { error: "INVALID_INPUT" };
  const { error } = await supabase.from("profiles").update({ full_name: name, phone: str(fd, "phone") || null }).eq("id", user.id);
  if (error) return { error: toErrorKey(error) };
  return done();
}

/** Save (or clear) the uploaded picture's public URL. The file itself is uploaded from the browser. */
export async function setAvatar(url: string | null): Promise<ActionResult> {
  const { supabase, user } = await getSession();
  if (!user) return { error: "NOT_AUTHENTICATED" };
  // only accept pictures from our own avatars bucket, inside this user's folder
  if (url && !url.startsWith(`${SUPABASE_URL}/storage/v1/object/public/avatars/${user.id}/`)) return { error: "INVALID_INPUT" };
  const { error } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", user.id);
  if (error) return { error: toErrorKey(error) };
  return done({ message: url ? "profile.photoSaved" : "profile.photoRemoved" });
}

/**
 * Set or change the login email. Asks for the current password first, then updates it directly
 * (the free email service is too limited for confirmation mails). The username keeps working.
 */
export async function changeEmail(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, user } = await getSession();
  if (!user?.email) return { error: "NOT_AUTHENTICATED" };
  const email = str(fd, "email").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.endsWith(`@${USERNAME_DOMAIN}`)) return { error: "INVALID_EMAIL" };
  if (email === user.email) return { error: "SAME_EMAIL" };

  // re-check the password without touching this browser's session
  const check = createPlainClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  const { error: pwError } = await check.auth.signInWithPassword({ email: user.email, password: String(fd.get("password") ?? "") });
  if (pwError) return { error: "WRONG_PASSWORD" };

  // keep their username login working: remember it before the placeholder email goes away
  const { data: profile } = await supabase.from("profiles").select("username").eq("id", user.id).single();
  const admin = createAdminClient();
  if (!profile?.username && user.email.endsWith(`@${USERNAME_DOMAIN}`)) {
    await admin.from("profiles").update({ username: displayLogin(user.email) }).eq("id", user.id);
  }
  const { error } = await admin.auth.admin.updateUserById(user.id, { email, email_confirm: true });
  if (error) return { error: /already|registered|exists/i.test(error.message) ? "LOGIN_TAKEN" : toErrorKey(error) };
  return done({ message: "profile.emailSaved" });
}
