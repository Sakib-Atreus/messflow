"use client";

import { useTransition, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  Ban, Check, CheckCircle2, ExternalLink, Lock, LockOpen, Pin, PinOff, RefreshCw, Repeat, Repeat1, RotateCcw, ShieldCheck, ShieldOff, Trash2, X,
} from "lucide-react";
import type { ActionResult } from "@/lib/errors";
import { restoreDeleted } from "@/lib/actions/undo";
import { useFeedback } from "./feedback";
import { btn, cn, Spinner } from "./ui";

/** Icon names a server page can pass (components themselves can't cross to the browser). */
const ICONS = {
  delete: Trash2, approve: Check, reject: X, pin: Pin, unpin: PinOff, refresh: RefreshCw, lock: Lock, unlock: LockOpen,
  open: ExternalLink, done: CheckCircle2, undo: RotateCcw, shield: ShieldCheck, unshield: ShieldOff, block: Ban, unblock: LockOpen, repeat: Repeat, unrepeat: Repeat1,
} as const;
export type ActionIcon = keyof typeof ICONS;

/** What the success toast says for each kind of action. */
const DONE_TEXT: Partial<Record<ActionIcon, string>> = {
  delete: "deleted", approve: "approved", reject: "rejected", lock: "monthClosed", unlock: "monthReopened",
};

/**
 * Runs a bound server action on click. Optional confirm dialog (danger style for delete/reject),
 * spinner while working, and a toast with the result - no browser popups.
 */
export function ActionButton({
  action,
  confirm,
  children,
  className,
  icon,
  iconOnly,
}: {
  action: () => Promise<ActionResult | void>;
  confirm?: string;
  children: ReactNode;
  className?: string;
  icon?: ActionIcon;
  /** show only the icon; `children` becomes the accessible label */
  iconOnly?: boolean;
}) {
  const t = useTranslations();
  const { toast, confirm: ask } = useFeedback();
  const [pending, start] = useTransition();
  const Icon = icon ? ICONS[icon] : null;
  const danger = icon === "delete" || icon === "reject";

  return (
    <button
      type="button"
      disabled={pending}
      aria-busy={pending}
      aria-label={iconOnly && typeof children === "string" ? children : undefined}
      title={iconOnly && typeof children === "string" ? children : undefined}
      className={cn(className ?? btn.small, pending && "cursor-wait")}
      onClick={async () => {
        if (confirm && !(await ask({ body: confirm, danger, confirmLabel: typeof children === "string" ? children : undefined }))) return;
        start(async () => {
          const r = await action();
          if (r && r.undo) {
            const { kind, row } = r.undo;
            toast(t("toast.deleted"), "success", {
              label: t("toast.undo"),
              onClick: () =>
                start(async () => {
                  const back = await restoreDeleted(kind, row);
                  toast(back.error ? t(`errors.${back.error}`) : t("toast.restored"), back.error ? "error" : "success");
                }),
            });
          } else if (r && r.error) toast(t(`errors.${r.error}`), "error");
          else if (r && r.message) toast(t(r.message as "toast.saved"), "success");
          else toast(t(`toast.${(icon && DONE_TEXT[icon]) || "saved"}` as "toast.saved"), "success");
        });
      }}
    >
      {pending ? <Spinner /> : Icon && <Icon className="size-4 shrink-0" />}
      {!iconOnly && children}
    </button>
  );
}
