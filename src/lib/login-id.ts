// Members created by an admin can log in with a short username instead of an email.
// Supabase Auth needs an email, so a username maps to a fixed placeholder domain.
export const USERNAME_DOMAIN = "users.messflow.app";
export const USERNAME_RE = /^[a-z0-9_.]{3,30}$/;

/** "karim" → "karim@users.messflow.app"; emails pass through (lower-cased). Null if invalid. */
export function loginToEmail(login: string): string | null {
  const v = login.trim().toLowerCase();
  if (v.includes("@")) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null;
  return USERNAME_RE.test(v) ? `${v}@${USERNAME_DOMAIN}` : null;
}

/** What to show a person as their login: the username for placeholder emails, else the email. */
export function displayLogin(email: string | null | undefined): string {
  if (!email) return "-";
  return email.endsWith(`@${USERNAME_DOMAIN}`) ? email.slice(0, -USERNAME_DOMAIN.length - 1) : email;
}

/** Readable temporary password, e.g. "mess-4821-kp". */
export function tempPassword(): string {
  const n = Math.floor(1000 + Math.random() * 9000);
  const a = "abcdefghjkmnpqrstuvwxyz";
  const r = () => a[Math.floor(Math.random() * a.length)];
  return `mess-${n}-${r()}${r()}`;
}
