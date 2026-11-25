"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { fmtMoney } from "@/lib/format";
import { cn, inputClass } from "./ui";

export type BillOption = {
  id: string;
  title: string;
  category: string;
  amount: number;
  /** what this member pays now (0 = not on this bill) */
  current: number;
  /** how many OTHER members pay towards it now */
  otherPayers: number;
};
type Mode = "keep" | "none" | "equal" | "amount";

/**
 * One row per fixed bill this month: choose whether the member pays nothing, an equal part, or a set amount.
 * Fields: bill_<id> = mode, amt_<id> = amount (only for "amount").
 */
export function BillChoices({ bills, isNew }: { bills: BillOption[]; isNew: boolean }) {
  const t = useTranslations("bills");
  const locale = useLocale();
  const money = (n: number) => fmtMoney(locale, n);
  // new member: khala/bua (cook) bill on by default, rent/gas/etc. off - the manager decides
  const initial = (b: BillOption): Mode => (isNew ? (b.category === "cook" ? "equal" : "none") : "keep");
  const [modes, setModes] = useState<Record<string, Mode>>(() => Object.fromEntries(bills.map((b) => [b.id, initial(b)])));

  return (
    <div className="space-y-2">
      {bills.map((b) => {
        const mode = modes[b.id];
        const equalShare = b.amount / (b.otherPayers + 1);
        return (
          <div
            key={b.id}
            className={cn(
              "grid items-center gap-2 rounded-xl border p-2.5 sm:grid-cols-[1fr_auto_auto]",
              mode === "none" || (mode === "keep" && !b.current)
                ? "border-slate-200 dark:border-slate-700"
                : "border-brand-300 bg-brand-50/60 dark:border-brand-800 dark:bg-brand-950/30",
            )}
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{b.title}</div>
              <div className="text-xs text-slate-500">
                {t("billTotal", { amount: money(b.amount) })}
                {!isNew && ` · ${b.current ? t("paysNow", { amount: money(b.current) }) : t("notOnBill")}`}
              </div>
            </div>
            <select
              name={`bill_${b.id}`}
              value={mode}
              onChange={(e) => setModes((m) => ({ ...m, [b.id]: e.target.value as Mode }))}
              className={`${inputClass} py-1.5 text-sm sm:w-52`}
            >
              {!isNew && <option value="keep">{t("keep")}</option>}
              <option value="none">{t("none")}</option>
              <option value="equal">{t("equal", { amount: money(equalShare) })}</option>
              <option value="amount">{t("amount")}</option>
            </select>
            {mode === "amount" ? (
              <input
                name={`amt_${b.id}`}
                type="number"
                min="0"
                max={b.amount}
                step="0.01"
                required
                defaultValue={b.current || ""}
                placeholder="৳"
                className={`${inputClass} py-1.5 text-sm sm:w-28`}
              />
            ) : (
              <span className="hidden sm:block sm:w-28" />
            )}
          </div>
        );
      })}
    </div>
  );
}
