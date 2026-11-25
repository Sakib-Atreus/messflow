const numberLocale = (locale: string) => (locale === "bn" ? "bn-BD" : "en-US");

export function fmtNumber(locale: string, n: number | string, digits = 2): string {
  return new Intl.NumberFormat(numberLocale(locale), {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  }).format(Number(n));
}

/** ৳1,500 for whole taka; ৳365.80 (always 2 decimals) when there are paisa. */
export function fmtMoney(locale: string, n: number | string): string {
  const v = Number(n);
  const abs = Math.round(Math.abs(v) * 100) / 100;
  const digits = Number.isInteger(abs) ? 0 : 2;
  const s = new Intl.NumberFormat(numberLocale(locale), { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(abs);
  return `${v < 0 && abs > 0 ? "−" : ""}৳${s}`;
}

export function fmtDate(locale: string, date: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) {
  return new Intl.DateTimeFormat(numberLocale(locale), { ...opts, timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`),
  );
}

export function fmtMonth(locale: string, date: string) {
  return fmtDate(locale, date, { month: "long", year: "numeric" });
}

export function fmtTime(locale: string, minutesFromMidnight: number) {
  const m = ((minutesFromMidnight % 1440) + 1440) % 1440;
  const d = new Date(Date.UTC(2000, 0, 1, Math.floor(m / 60), m % 60));
  return new Intl.DateTimeFormat(numberLocale(locale), { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(d);
}
