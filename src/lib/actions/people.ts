"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { notifyApproved } from "@/lib/notify";
import { getContext } from "@/lib/mess";
import { createAccount } from "@/lib/accounts";
import { createAdminClient } from "@/lib/supabase/server";
import { toErrorKey, type ActionResult } from "@/lib/errors";
import { isValidDate, todayDhaka } from "@/lib/dates";
import { PERMISSIONS, type Permission } from "@/lib/types";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const bool = (fd: FormData, k: string) => fd.get(k) === "on" || fd.get(k) === "true";
const done = (extra: Partial<ActionResult> = {}): ActionResult => {
  revalidatePath("/", "layout");
  return { ok: true, ...extra };
};
const loginDetail = (login: string, password: string) => `${login}  ·  ${password}`;

/** select value: "manager" | "member" | <custom role id> */
function parseRole(v: string): { role: "manager" | "member"; role_id: string | null } {
  if (v === "manager") return { role: "manager", role_id: null };
  if (/^[0-9a-f-]{36}$/.test(v)) return { role: "member", role_id: v };
  return { role: "member", role_id: null };
}

// ---------------------------------------------------------------- bill shares
type Supa = Awaited<ReturnType<typeof getContext>>["supabase"];

/** Reads bill_<costId> (keep|none|equal|amount) + amt_<costId> from the form and applies each change. */
async function applyBillChoices(supabase: Supa, memberId: string, fd: FormData) {
  for (const [key, value] of fd.entries()) {
    if (!key.startsWith("bill_")) continue;
    const mode = String(value);
    if (mode === "keep") continue;
    if (!["none", "equal", "amount"].includes(mode)) return "INVALID_INPUT" as const;
    const costId = key.slice(5);
    const amount = mode === "amount" ? Number(String(fd.get(`amt_${costId}`) ?? "").replace(/,/g, "")) : null;
    if (mode === "amount" && !(amount! >= 0)) return "INVALID_INPUT" as const;
    const { error } = await supabase.rpc("set_bill_share", { p_cost: costId, p_member: memberId, p_mode: mode, p_amount: amount });
    if (error) return toErrorKey(error);
  }
  return null;
}

/** Change which of this month's bills an existing member pays. */
export async function setMemberBills(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, can } = await getContext();
  if (!can("costs")) return { error: "FORBIDDEN" };
  const err = await applyBillChoices(supabase, str(fd, "member_id"), fd);
  if (err) return { error: err };
  return done();
}

// ---------------------------------------------------------------- members
/** Add a member; optionally create their login with a temporary password right away. */
export async function addMember(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, mess, locale, can, isManager } = await getContext();
  if (!can("members")) return { error: "FORBIDDEN" };
  const name = str(fd, "display_name");
  if (!name) return { error: "INVALID_INPUT" };

  let userId: string | null = null;
  let detail: string | undefined;
  const login = str(fd, "login");
  if (login) {
    const acc = await createAccount({ login, password: str(fd, "password"), fullName: name, phone: str(fd, "phone"), locale });
    if ("error" in acc) return { error: acc.error };
    userId = acc.id;
    detail = loginDetail(acc.login, acc.password);
  }
  const role = isManager ? parseRole(str(fd, "role")) : { role: "member" as const, role_id: null };
  const { data: inserted, error } = await supabase.from("mess_members").insert({
    mess_id: mess.id,
    user_id: userId,
    claim_code: userId ? null : undefined,
    display_name: name,
    phone: str(fd, "phone") || null,
    room: str(fd, "room") || null,
    joined_on: isValidDate(str(fd, "joined_on")) ? str(fd, "joined_on") : todayDhaka(),
    default_breakfast: bool(fd, "default_breakfast"),
    default_lunch: bool(fd, "default_lunch"),
    default_dinner: bool(fd, "default_dinner"),
    ...role,
  }).select("id").single();
  if (error) {
    if (userId) await createAdminClient().auth.admin.deleteUser(userId); // don't leave an orphan login
    return { error: toErrorKey(error) };
  }
  await supabase.rpc("ensure_meals", { p_mess: mess.id });
  // which of this month's bills the newcomer shares (only people who manage costs may choose)
  if (can("costs") && inserted) {
    const billErr = await applyBillChoices(supabase, inserted.id, fd);
    if (billErr) return { error: billErr, detail };
  }
  return done(detail ? { message: "members.loginCreated", detail } : {});
}

/** Give an existing member (added without an account) a login + temporary password. */
export async function createMemberLogin(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, mess, locale, can } = await getContext();
  if (!can("members")) return { error: "FORBIDDEN" };
  const { data: m } = await supabase
    .from("mess_members")
    .select("id, display_name, phone, user_id")
    .eq("id", str(fd, "id"))
    .eq("mess_id", mess.id)
    .single();
  if (!m || m.user_id) return { error: "FORBIDDEN" };
  const acc = await createAccount({ login: str(fd, "login"), password: str(fd, "password"), fullName: m.display_name, phone: m.phone, locale });
  if ("error" in acc) return { error: acc.error };
  const { error } = await supabase.from("mess_members").update({ user_id: acc.id, claim_code: null }).eq("id", m.id);
  if (error) return { error: toErrorKey(error) };
  return done({ message: "members.loginCreated", detail: loginDetail(acc.login, acc.password) });
}

export async function updateMember(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, me, isManager, can } = await getContext();
  if (!can("members")) return { error: "FORBIDDEN" };
  const id = str(fd, "id");
  const leftOn = str(fd, "left_on");
  const patch: Record<string, unknown> = {
    display_name: str(fd, "display_name"),
    phone: str(fd, "phone") || null,
    room: str(fd, "room") || null,
    default_breakfast: bool(fd, "default_breakfast"),
    default_lunch: bool(fd, "default_lunch"),
    default_dinner: bool(fd, "default_dinner"),
    status: isValidDate(leftOn) ? "left" : "active",
    left_on: isValidDate(leftOn) ? leftOn : null,
  };
  if (isManager && fd.has("role")) {
    const role = parseRole(str(fd, "role"));
    if (id === me.id && role.role !== "manager") return { error: "FORBIDDEN" }; // never demote yourself by accident
    Object.assign(patch, role);
  }
  const { error } = await supabase.from("mess_members").update(patch).eq("id", id);
  if (error) return { error: toErrorKey(error) };
  return done();
}

export async function reviewJoinRequest(id: string, approve: boolean): Promise<ActionResult> {
  const { supabase, mess } = await getContext();
  const { data: req } = await supabase.from("join_requests").select("user_id").eq("id", id).maybeSingle();
  const { error } = await supabase.rpc("review_join_request", { p_id: id, p_approve: approve });
  if (error) return { error: toErrorKey(error) };
  if (approve) {
    await supabase.rpc("ensure_meals", { p_mess: mess.id });
    if (req) after(() => notifyApproved(req.user_id, mess.name, "join"));
  }
  return done();
}

// ---------------------------------------------------------------- custom roles
function readPerms(fd: FormData): Permission[] {
  return PERMISSIONS.filter((p) => fd.get(`perm_${p}`) === "on");
}

export async function saveRole(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { supabase, mess, isManager } = await getContext();
  if (!isManager) return { error: "FORBIDDEN" };
  const name = str(fd, "name");
  if (!name) return { error: "INVALID_INPUT" };
  const id = str(fd, "id");
  const row = { name, permissions: readPerms(fd) };
  const { error } = id
    ? await supabase.from("mess_roles").update(row).eq("id", id).eq("mess_id", mess.id)
    : await supabase.from("mess_roles").insert({ ...row, mess_id: mess.id });
  if (error) return { error: toErrorKey(error) };
  return done();
}

export async function deleteRole(id: string): Promise<ActionResult> {
  const { supabase, mess, isManager } = await getContext();
  if (!isManager) return { error: "FORBIDDEN" };
  const { error } = await supabase.from("mess_roles").delete().eq("id", id).eq("mess_id", mess.id);
  if (error) return { error: toErrorKey(error) };
  return done();
}
