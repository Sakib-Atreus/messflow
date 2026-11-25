"use server";

import { cookies, headers } from "next/headers";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { toErrorKey, type ActionResult } from "@/lib/errors";
import { getSession, MESS_COOKIE } from "@/lib/mess";
import { loginToEmail } from "@/lib/login-id";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function signIn(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const login = str(fd, "email").toLowerCase();
  let email = loginToEmail(login);
  if (!email) return { error: "INVALID_LOGIN" };
  if (!login.includes("@")) {
    // username → whatever email that account uses now (placeholder or a real one they added)
    const admin = createAdminClient();
    const { data: p } = await admin.from("profiles").select("id").eq("username", login).maybeSingle();
    if (p) {
      const { data } = await admin.auth.admin.getUserById(p.id);
      if (data.user?.email) email = data.user.email;
    }
  }
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: String(fd.get("password") ?? ""),
  });
  if (error) return { error: toErrorKey(error) };
  return redirect({ href: "/dashboard", locale: await getLocale() });
}

export async function signUp(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const locale = await getLocale();
  const password = String(fd.get("password") ?? "");
  if (password.length < 6) return { error: "WEAK_PASSWORD" };
  const { data, error } = await supabase.auth.signUp({
    email: str(fd, "email"),
    password,
    options: {
      data: { full_name: str(fd, "full_name"), phone: str(fd, "phone") || null, locale },
      emailRedirectTo: `${(await headers()).get("origin") ?? ""}/auth/confirm`,
    },
  });
  if (error) return { error: toErrorKey(error) };
  // Email confirmation enabled in Supabase → no session yet
  if (!data.session) return { ok: true, message: "checkEmail" };
  return redirect({ href: "/onboarding", locale });
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  (await cookies()).delete(MESS_COOKIE);
  return redirect({ href: "/login", locale: await getLocale() });
}

/** First login with a temporary password (or any time from settings): set a new one. */
export async function changePassword(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, user } = await getSession();
  const locale = await getLocale();
  if (!user) return redirect({ href: "/login", locale });
  const password = String(fd.get("password") ?? "");
  if (password.length < 6) return { error: "WEAK_PASSWORD" };
  if (password !== String(fd.get("confirm") ?? "")) return { error: "PASSWORD_MISMATCH" };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: toErrorKey(error) };
  await supabase.rpc("password_changed");
  return redirect({ href: "/dashboard", locale });
}
