"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "./ui";

/**
 * Native <dialog>: focus trap, Esc to close and backdrop for free. Bottom sheet on phones;
 * centered box on wider screens, or a full-height panel on the right with `side`.
 */
export function Modal({
  open, onClose, title, children, side,
}: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; side?: boolean }) {
  const t = useTranslations("common");
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cn(
        "m-0 mt-auto max-h-[92dvh] w-full max-w-none rounded-t-3xl bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/60 backdrop:backdrop-blur-sm dark:bg-slate-900 dark:text-slate-100",
        side
          ? "mf-side sm:mr-0 sm:ml-auto sm:mt-0 sm:h-dvh sm:max-h-dvh sm:max-w-lg sm:rounded-none sm:rounded-l-3xl"
          : "sm:m-auto sm:max-w-lg sm:rounded-3xl",
      )}
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <h2 className="text-lg font-semibold">{title}</h2>
        <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label={t("close")}>
          <X className="size-5" />
        </button>
      </div>
      <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">{children}</div>
    </dialog>
  );
}
