import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { PERMISSIONS, type Member, type Mess, type Permission, type Profile } from "@/lib/types";

export const MESS_COOKIE = "mf_mess";

/** The signed-in user, read from the login token. The token's signature is checked locally with the
 *  project's public key (no network call), and the database checks it again on every query (RLS). */
export type SessionUser = { id: string; email: string };

const getClaimsUser = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const c = data?.claims;
  const user: SessionUser | null = c?.sub ? { id: c.sub, email: typeof c.email === "string" ? c.email : "" } : null;
  return { supabase, user };
});

const PROFILE_COLUMNS = "id, full_name, phone, locale, is_super_admin, must_change_password, username, avatar_url, blocked";

const loadProfile = cache(async () => {
  const { supabase, user } = await getClaimsUser();
  if (!user) return null;
  const first = await supabase.from("profiles").select(PROFILE_COLUMNS).eq("id", user.id).single();
  let data = first.data;
  // database not migrated yet (no "blocked" column): load the profile without it
  if (first.error?.code === "42703") ({ data } = await supabase.from("profiles").select(PROFILE_COLUMNS.replace(", blocked", "")).eq("id", user.id).single());
  return (data as (Profile & { blocked?: boolean }) | null) ?? null;
});

/** Logged-in user (null when signed out or blocked by the super admin). */
export const getSession = cache(async () => {
  const { supabase, user } = await getClaimsUser();
  if (!user) return { supabase, user: null };
  const profile = await loadProfile();
  // a blocked account counts as signed out right away (its sign-in is banned too)
  return { supabase, user: profile?.blocked ? null : user };
});

export const getProfile = cache(async () => {
  const { user } = await getSession();
  return user ? loadProfile() : null;
});

/** Logged-in user + profile, enforcing the first-login password change. */
export const requireUser = cache(async () => {
  const { supabase, user } = await getSession();
  const locale = await getLocale();
  if (!user) return redirect({ href: "/login", locale });
  const profile = await getProfile();
  if (profile?.must_change_password) return redirect({ href: "/change-password", locale });
  return { supabase, user, locale, profile, isSuperAdmin: !!profile?.is_super_admin };
});

/** The cook (khala) login of a mess, if this user is one. Cooks only see the kitchen page. */
export const getCook = cache(async () => {
  const { supabase, user } = await getSession();
  if (!user) return null;
  const { data } = await supabase.from("mess_cooks").select("mess_id, name").eq("user_id", user.id).maybeSingle();
  return (data as { mess_id: string; name: string } | null) ?? null;
});

type Membership = Member & { mess: Mess; mess_role: { name: string; permissions: Permission[] } | null };

/** A super admin looking at a mess they are not a member of acts through this stand-in. */
const VIRTUAL_ID = "00000000-0000-0000-0000-000000000000";

/** Current user + their active mess + what they may do there. Redirects when missing. */
export const getContext = cache(async () => {
  // the memberships query runs at the same time as the profile check (both only need the user id)
  const claims = await getClaimsUser();
  const membersQuery = claims.user
    ? claims.supabase
        .from("mess_members")
        .select("*, mess:messes!mess_members_mess_id_fkey(*), mess_role:mess_roles(name, permissions)")
        .eq("user_id", claims.user.id)
        .order("created_at")
        .then((r) => r)
    : null;
  const { supabase, user, locale, profile, isSuperAdmin } = await requireUser();
  const { data, error } = await membersQuery!;
  // a failed query must not look like "no mess" - that would bounce between dashboard and onboarding
  if (error) throw new Error(`Could not load your mess: ${error.message}`);
  const memberships = (data ?? []) as Membership[];
  const wanted = (await cookies()).get(MESS_COOKIE)?.value;

  let me = memberships.find((m) => m.mess_id === wanted) ?? memberships[0];
  if (isSuperAdmin && wanted && me?.mess_id !== wanted) {
    const { data: mess } = await supabase.from("messes").select("*").eq("id", wanted).maybeSingle();
    if (mess) me = virtualMember(mess as Mess, profile?.full_name || "Admin");
  }
  if (!me) {
    if (!isSuperAdmin && (await getCook())) return redirect({ href: "/kitchen", locale });
    return redirect({ href: isSuperAdmin ? "/admin" : "/onboarding", locale });
  }

  const isVirtual = me.id === VIRTUAL_ID;
  const isManager = isSuperAdmin || (me.role === "manager" && me.status === "active");
  const perms: Permission[] = isManager
    ? [...PERMISSIONS]
    : me.status === "active"
      ? (me.mess_role?.permissions ?? [])
      : [];
  const can = (p: Permission) => perms.includes(p);
  /** true when the user can manage anything at all (shows the management dashboard) */
  const isStaff = perms.length > 0;

  return { supabase, user, locale, profile, me, mess: me.mess, memberships, isManager, isSuperAdmin, isVirtual, perms, can, isStaff };
});

function virtualMember(mess: Mess, name: string): Membership {
  return {
    id: VIRTUAL_ID, mess_id: mess.id, user_id: null, display_name: name, phone: null, role: "manager", role_id: null,
    room: null, status: "active", joined_on: mess.created_at.slice(0, 10), left_on: null,
    default_breakfast: false, default_lunch: false, default_dinner: false, claim_code: null,
    mess, mess_role: null,
  };
}
