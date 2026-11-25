"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { addFixedCost } from "@/lib/actions/mess";
import { fmtMoney } from "@/lib/format";
import { ActionForm, SubmitButton } from "./action-form";
import { Plus } from "lucide-react";
import { Modal } from "./modal";
import { btn, Field, inputClass } from "./ui";
import { COST_CATEGORIES, PER_PERSON_CATEGORIES } from "@/lib/costs";

export function FixedCostForm({
  month, members, onSaved,
}: { month: string; members: { id: string; name: string }[]; onSaved?: () => void }) {
  const t = useTranslations();
  const locale = useLocale();
  const [split, setSplit] = useState<"equal" | "custom">("equal");
  const [shares, setShares] = useState<Record<string, string>>({});
  const total = Object.values(shares).reduce((a, v) => a + (Number(v) || 0), 0);

  return (
    <ActionForm
      action={addFixedCost}
      onDone={() => {
        setShares({});
        setSplit("equal");
        onSaved?.();
      }}
    >
      <input type="hidden" name="month" value={month} />
      <div className="grid gap-3 sm:grid-cols-2 [&>*:last-child]:sm:col-span-2">
        <Field label={t("costs.category")}>
          <select
            name="category"
            className={inputClass}
            defaultValue="rent"
            onChange={(e) => PER_PERSON_CATEGORIES.includes(e.target.value) && setSplit("custom")}
          >
            {COST_CATEGORIES.map((c) => (
              <option key={c} value={c}>{t(`costs.categories.${c}`)}</option>
            ))}
          </select>
        </Field>
        <Field label={t("costs.titleField")}>
          <input name="title" required className={inputClass} placeholder={t("costs.categories.rent")} />
        </Field>
        <Field label={t("costs.split")}>
          <select name="split" value={split} onChange={(e) => setSplit(e.target.value as "equal" | "custom")} className={inputClass}>
            <option value="equal">{t("costs.equal")}</option>
            <option value="custom">{t("costs.custom")}</option>
          </select>
        </Field>
      </div>

      {split === "equal" ? (
        <Field label={t("common.amount")}>
          <input type="number" name="amount" step="0.01" min="0.01" inputMode="decimal" required className={inputClass} />
        </Field>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-slate-500">{t("costs.customHelp", { total: fmtMoney(locale, total) })}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {members.map((m) => (
              <label key={m.id} className="flex items-center gap-2">
                <span className="w-32 truncate text-sm">{m.name}</span>
                <input
                  type="number"
                  name={`share_${m.id}`}
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  value={shares[m.id] ?? ""}
                  onChange={(e) => setShares((s) => ({ ...s, [m.id]: e.target.value }))}
                  className={inputClass}
                />
              </label>
            ))}
          </div>
        </div>
      )}
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50/60 dark:border-slate-700 dark:has-[:checked]:bg-brand-950/30">
        <input type="checkbox" name="repeat_monthly" className="mt-0.5 size-5 accent-brand-600" />
        <span>
          <span className="block text-sm font-medium">{t("costs.repeatLabel")}</span>
          <span className="block text-xs text-slate-500">{t("costs.repeatHelp")}</span>
        </span>
      </label>
      <SubmitButton>{t("common.add")}</SubmitButton>
    </ActionForm>
  );
}

/** "+ Add fixed cost" button that opens the form in a dialog and closes it after saving. */
export function AddFixedCost({ month, members, label }: { month: string; members: { id: string; name: string }[]; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={btn.primary} onClick={() => setOpen(true)}>
        <Plus className="size-4" /> {label}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={label}>
        {open && <FixedCostForm month={month} members={members} onSaved={() => setOpen(false)} />}
      </Modal>
    </>
  );
}
