import type { ReactNode } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { CookingPot } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Field, inputClass } from "@/components/ui";
import { saveMenu } from "@/lib/actions/people";
import type { MealKind } from "@/lib/types";
import { translateMenu } from "@/lib/dishes";

export type Menu = (Partial<Record<MealKind, string | null>> & { note?: string | null }) | null;

/** "What to cook" for one day: the manager writes it, everyone else reads it. */
export async function MenuCard({ date, dateLabel, kinds, menu, canEdit, action, footer }: {
  date: string;
  dateLabel: string;
  kinds: MealKind[];
  menu: Menu;
  canEdit: boolean;
  /** shown in the card header (e.g. the "Khala's leave" button) */
  action?: ReactNode;
  /** a status line under the card body (e.g. khala's next leave) */
  footer?: ReactNode;
}) {
  const t = await getTranslations();
  const title = `${t("menu.title")} · ${dateLabel}`;
  if (canEdit) {
    return (
      <Card title={title} icon={CookingPot} action={action}>
        <ActionForm action={saveMenu} reset={false} key={date}>
          <input type="hidden" name="date" value={date} />
          <div className="grid gap-3 sm:grid-cols-2">
            {kinds.map((k) => (
              <Field key={k} label={t(`meal.${k}`)}>
                <input name={k} maxLength={200} defaultValue={menu?.[k] ?? ""} placeholder={t("menu.placeholder")} className={inputClass} />
              </Field>
            ))}
          </div>
          <p className="text-xs text-slate-500">{t("menu.help")}</p>
          <Field label={t("menu.note")} hint={t("menu.noteHint")}>
            <textarea name="note" rows={2} maxLength={500} defaultValue={menu?.note ?? ""} placeholder={t("menu.notePlaceholder")} className={inputClass} />
          </Field>
          <SubmitButton>{t("menu.save")}</SubmitButton>
        </ActionForm>
        {footer}
      </Card>
    );
  }
  const set = kinds.filter((k) => menu?.[k]);
  const locale = await getLocale();
  return (
    <Card title={title} icon={CookingPot} action={action}>
      {set.length ? (
        <dl className="space-y-1.5">
          {set.map((k) => (
            <div key={k} className="flex gap-2">
              <dt className="w-16 shrink-0 text-slate-500">{t(`meal.${k}`)}</dt>
              <dd className="font-medium">{translateMenu(menu![k], locale)}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-sm text-slate-500">{t("menu.notSet")}</p>
      )}
      {footer}
    </Card>
  );
}

/** One short line for the dashboard: "Lunch: rice, chicken · Dinner: fish". Null when nothing is set. */
export function menuLine(menu: Menu, kinds: MealKind[], label: (k: MealKind) => string, locale: string): string | null {
  const parts = kinds.filter((k) => menu?.[k]).map((k) => `${label(k)}: ${translateMenu(menu![k], locale)}`);
  return parts.length ? parts.join(" · ") : null;
}
