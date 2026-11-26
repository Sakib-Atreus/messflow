import { getTranslations } from "next-intl/server";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Avatar, inputClass } from "@/components/ui";
import { saveOpeningBalances } from "@/lib/actions/people";
import type { Member } from "@/lib/types";

/**
 * Manager, first month only: each person's old balance from the notebook. "Owes" is a due, "Is owed"
 * is money the mess owes them. Saved together; empty = nothing. Shown inside the "Opening balance" dialog.
 */
export async function OpeningBalanceForm({ members, amounts }: { members: Member[]; amounts: Map<string, number> }) {
  const t = await getTranslations("opening");
  const value = (n: number | undefined) => (n ? String(Math.abs(n)) : "");
  return (
    <ActionForm action={saveOpeningBalances} reset={false}>
      <p className="text-sm text-slate-600 dark:text-slate-400">{t("help")}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-2 font-medium">{t("member")}</th>
              <th className="px-2 py-2 font-medium text-red-700 dark:text-red-400">{t("owes")}</th>
              <th className="py-2 pl-2 font-medium text-brand-700 dark:text-brand-400">{t("isOwed")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {members.map((m) => {
              const a = amounts.get(m.id);
              return (
                <tr key={m.id} data-opening={m.display_name}>
                  <td className="py-2 pr-2">
                    <div className="flex items-center gap-2">
                      <Avatar name={m.display_name} className="size-7" />
                      <span className="font-medium">{m.display_name}</span>
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <input
                      name={`due_${m.id}`}
                      inputMode="decimal"
                      defaultValue={a && a < 0 ? value(a) : ""}
                      placeholder="৳0"
                      aria-label={`${t("owes")} - ${m.display_name}`}
                      className={`${inputClass} min-h-10 w-28 tabular-nums`}
                    />
                  </td>
                  <td className="py-2 pl-2">
                    <input
                      name={`credit_${m.id}`}
                      inputMode="decimal"
                      defaultValue={a && a > 0 ? value(a) : ""}
                      placeholder="৳0"
                      aria-label={`${t("isOwed")} - ${m.display_name}`}
                      className={`${inputClass} min-h-10 w-28 tabular-nums`}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">{t("lockNote")}</p>
      <SubmitButton>{t("save")}</SubmitButton>
    </ActionForm>
  );
}
