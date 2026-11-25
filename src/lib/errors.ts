const KNOWN = [
  "CUTOFF_PASSED", "MONTH_CLOSED", "FORBIDDEN", "INVALID_CODE", "ALREADY_MEMBER", "SHARES_MISMATCH",
  "NO_MEMBERS", "BREAKFAST_DISABLED", "INVALID_RANGE", "NEXT_MONTH_CLOSED", "FUTURE_MONTH",
  "MEMBER_NOT_FOUND", "NOT_AUTHENTICATED", "DUTY_CONFLICT", "ALREADY_REQUESTED",
] as const;

export type ErrorKey = (typeof KNOWN)[number] | "INVALID_LOGIN" | "USER_EXISTS" | "WEAK_PASSWORD" | "INVALID_INPUT" | "UNKNOWN"
  | "PASSWORD_MISMATCH" | "INVALID_USERNAME" | "LOGIN_TAKEN" | "DUPLICATE"
  | "INVALID_EMAIL" | "SAME_EMAIL" | "WRONG_PASSWORD";

/** Maps a Supabase/Postgres error to a translation key under `errors.*`. */
export function toErrorKey(err: { message?: string } | null | undefined): ErrorKey {
  const msg = err?.message ?? "";
  const hit = KNOWN.find((k) => msg.includes(k));
  if (hit) return hit;
  if (msg.includes("row-level security")) return "FORBIDDEN";
  if (msg.includes("Invalid login credentials")) return "INVALID_LOGIN";
  if (msg.includes("already registered") || msg.includes("already been registered")) return "LOGIN_TAKEN";
  if (msg.includes("duplicate key")) return "DUPLICATE";
  if (msg.toLowerCase().includes("password")) return "WEAK_PASSWORD";
  if (msg.includes("violates check constraint") || msg.includes("invalid input")) return "INVALID_INPUT";
  console.error("[messflow] unmapped error:", msg);
  return "UNKNOWN";
}

/** message: a translation key ("auth.checkEmail" or a bare key under auth.*); detail: shown verbatim. */
export type ActionResult = {
  ok?: boolean;
  error?: ErrorKey;
  message?: string;
  detail?: string;
  /** a deleted row that can be put back (see actions/undo.ts) */
  undo?: { kind: "bazar" | "deposit" | "notice"; row: Record<string, unknown> };
};
