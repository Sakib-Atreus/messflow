// "Meal money": what a member has paid this month (plus last month's carry), after their rent and
// bills are taken out, minus the meals eaten so far. Shows how fast it goes and when it runs out.
import { addDays } from "./dates";

export const LOW_DAYS = 3; // default; each mess can choose 2–5 in Settings

export type WalletStatus = "ok" | "low" | "out" | "idle";
export type WalletPoint = { date: string; left: number; mealCost: number; paid: number };
export type Wallet = {
  status: WalletStatus;
  /** money left for meals right now (= the member's balance) */
  left: number;
  /** paid + carried in − bills: the meal money they started with */
  forMeals: number;
  bills: number;
  paid: number;
  /** average meal spend per day over the last 7 days */
  perDay: number;
  /** whole days of meals left at that pace (null when nothing is being spent) */
  daysLeft: number | null;
  /** date the money is expected to run out (null if not within reach) */
  runOut: string | null;
  /** the day it actually went below zero (when already finished) */
  ranOutOn: string | null;
  /** rough amount to pay so it lasts to the end of the month (rounded up to ৳50) */
  suggest: number;
  /** lasts past the end of this month at the current pace */
  lastsMonth: boolean;
  /** about how much will be left when the month ends (current month, at the current pace) */
  endLeft: number;
  days: WalletPoint[];
  /** straight-line forecast from today to the run-out date or month end */
  forecast: { date: string; left: number }[];
};

export function mealWallet(input: {
  month: string; // YYYY-MM-01
  monthEnd: string;
  today: string;
  rate: number; // meal rate of the month
  bills: number; // this member's fixed share (rent, gas, …)
  carry: number; // carried from last month (+ credit / − due)
  balance: number; // the official balance from the monthly summary
  deposits: { date: string; amount: number }[]; // approved
  mealsByDay: Record<string, number>; // weighted meals per date
  lowDays?: number; // the mess's "almost finished" setting
}): Wallet {
  const { month, monthEnd, today, rate, bills, carry, balance } = input;
  const until = monthEnd < today ? monthEnd : today;
  const days: WalletPoint[] = [];
  let paidSoFar = carry;
  let eaten = 0;
  for (let d = month; d <= until; d = addDays(d, 1)) {
    const paid = input.deposits.filter((x) => x.date === d).reduce((a, x) => a + Number(x.amount), 0);
    const mealCost = (input.mealsByDay[d] ?? 0) * rate;
    paidSoFar += paid;
    eaten += mealCost;
    days.push({ date: d, left: paidSoFar - bills - eaten, mealCost, paid });
  }
  if (days.length) days[days.length - 1].left = balance; // match the official figure to the paisa

  const paid = input.deposits.reduce((a, x) => a + Number(x.amount), 0);
  const recent = days.slice(-7);
  const perDay = recent.length ? recent.reduce((a, x) => a + x.mealCost, 0) / recent.length : 0;
  const left = balance;
  const daysLeft = left <= 0 ? 0 : perDay > 0 ? left / perDay : null;
  const isCurrent = today <= monthEnd && today >= month;

  let status: WalletStatus = "ok";
  if (left <= 0.004 && (eaten > 0 || bills > 0)) status = "out";
  else if (daysLeft !== null && daysLeft <= (input.lowDays ?? LOW_DAYS) && perDay > 0) status = "low";
  else if (perDay === 0 && left >= 0) status = "idle"; // nothing being spent (or nothing paid or eaten yet)

  const daysToGo = isCurrent ? Math.max(0, Math.round((Date.parse(monthEnd) - Date.parse(today)) / 864e5)) : 0;
  // the bill closes at month end, so never forecast past it
  const lastsMonth = left > 0 && (daysLeft === null || daysLeft >= daysToGo);
  const runOut = isCurrent && !lastsMonth && daysLeft !== null && left > 0 ? addDays(today, Math.floor(daysLeft)) : null;
  const endLeft = left - perDay * daysToGo;
  const need = perDay * daysToGo - left;
  const suggest = need > 0 ? Math.ceil(need / 50) * 50 : 0;

  const forecast: { date: string; left: number }[] = [];
  if (isCurrent && perDay > 0 && left > 0) {
    const stop = runOut && runOut < monthEnd ? addDays(runOut, 1) : monthEnd;
    for (let d = today, k = 0; d <= stop; d = addDays(d, 1), k++) forecast.push({ date: d, left: left - perDay * k });
  }

  // the last day the money was used up (reached zero) after having some left
  let ranOutOn: string | null = null;
  if (left < 0) {
    for (let i = days.length - 1; i >= 0; i--) {
      if (days[i].left <= 0.004 && (i === 0 || days[i - 1].left > 0.004)) {
        ranOutOn = days[i].date;
        break;
      }
    }
  }

  return {
    status, left, forMeals: carry + paid - bills, bills, paid, perDay, daysLeft, runOut, ranOutOn, suggest, lastsMonth, endLeft, days, forecast,
  };
}
