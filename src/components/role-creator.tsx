"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import { saveRole } from "@/lib/actions/people";
import { PERMISSIONS, type Permission } from "@/lib/types";
import { ActionForm, SubmitButton } from "./action-form";
import { cn, Field, inputClass } from "./ui";

export const ROLE_PRESETS: Record<string, Permission[]> = {
  assistant: ["meals", "bazar", "deposits", "notices", "roster"],
  cashier: ["deposits", "costs"],
  bazarLead: ["bazar", "roster"],
};

/** Permission tick-cards (controlled), shared by "create" and "edit". */
function PermissionCards({ value, onChange }: { value: Permission[]; onChange: (v: Permission[]) => void }) {
  const t = useTranslations("perms");
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {PERMISSIONS.map((p) => {
        const on = value.includes(p);
        return (
          <label
            key={p}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition",
              on ? "border-brand-500 bg-brand-50 dark:border-brand-700 dark:bg-brand-950/40" : "border-slate-200 hover:border-slate-300 dark:border-slate-700",
            )}
          >
            <input
              type="checkbox"
              name={`perm_${p}`}
              checked={on}
              onChange={(e) => onChange(e.target.checked ? [...value, p] : value.filter((x) => x !== p))}
              className="mt-0.5 size-5 accent-brand-600"
            />
            <span>
              <span className="block text-sm font-medium">{t(p)}</span>
              <span className="block text-xs text-slate-500">{t(`${p}Help`)}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

/** Create a role, or edit one (id + initial values). Presets fill the name and ticks in one tap. */
export function RoleForm({ id, name: initialName = "", permissions = [] }: { id?: string; name?: string; permissions?: Permission[] }) {
  const t = useTranslations("roles");
  const [name, setName] = useState(initialName);
  const [perms, setPerms] = useState<Permission[]>(permissions);
  const presetName = (k: string) => t(`preset_${k}` as "preset_assistant");
  return (
    <ActionForm
      action={saveRole}
      reset={false}
      onDone={() => {
        if (!id) {
          setName("");
          setPerms([]);
        }
      }}
    >
      {id && <input type="hidden" name="id" value={id} />}
      {!id && (
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-600 dark:text-slate-300">
            <Sparkles className="size-4 text-brand-600" /> {t("quickStart")}
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(ROLE_PRESETS).map(([k, p]) => {
              const active = name === presetName(k) && p.length === perms.length && p.every((x) => perms.includes(x));
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setName(presetName(k));
                    setPerms(p);
                  }}
                  className={cn(
                    "inline-flex min-h-9 items-center rounded-full border px-3.5 text-sm font-medium transition",
                    active
                      ? "border-brand-600 bg-brand-600 text-white"
                      : "border-slate-300 hover:border-brand-400 hover:bg-brand-50 dark:border-slate-700 dark:hover:bg-brand-950/40",
                  )}
                >
                  {presetName(k)}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <Field label={t("name")}>
        <input name="name" value={name} onChange={(e) => setName(e.target.value)} required placeholder={t("namePlaceholder")} className={inputClass} />
      </Field>
      <PermissionCards value={perms} onChange={setPerms} />
      <SubmitButton>{id ? t("saveRole") : t("create")}</SubmitButton>
    </ActionForm>
  );
}
