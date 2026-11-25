// Business dates are plain 'YYYY-MM-DD' strings in Asia/Dhaka.

export function todayDhaka(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(now);
}

/** Minutes since midnight in Dhaka (UTC+6, no DST). */
export function dhakaMinutes(now = new Date()): number {
  return (now.getUTCHours() * 60 + now.getUTCMinutes() + 6 * 60) % (24 * 60);
}

/** UTC timestamp (ms) of a meal cutoff: date 00:00 Dhaka + interval offset. */
export function cutoffTime(date: string, cutoff: string): number {
  return Date.parse(`${date}T00:00:00Z`) - 6 * 60 * 60 * 1000 + intervalToMinutes(cutoff) * 60 * 1000;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export function monthEnd(date: string): string {
  const d = new Date(`${monthStart(date)}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1, 0);
  return d.toISOString().slice(0, 10);
}

export function addMonths(date: string, months: number): string {
  const d = new Date(`${monthStart(date)}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

export function isValidDate(s: string | undefined | null): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}

/** Postgres interval like "10:00:00" or "-01:00:00" → minutes offset from 00:00 of the meal date. */
export function intervalToMinutes(iv: string): number {
  const neg = iv.trim().startsWith("-");
  const [h, m] = iv.replace("-", "").split(":").map(Number);
  return (neg ? -1 : 1) * (h * 60 + (m || 0));
}

/** True if the cutoff for this meal date has passed (Dhaka time, UTC+6, no DST). */
export function isPastCutoff(date: string, cutoff: string, now = new Date()): boolean {
  return now.getTime() >= cutoffTime(date, cutoff);
}
