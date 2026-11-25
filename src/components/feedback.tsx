"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { Modal } from "./modal";
import { btn, cn } from "./ui";

type Tone = "success" | "error" | "info";
type ToastAction = { label: string; onClick: () => void };
type Toast = { id: number; text: string; tone: Tone; action?: ToastAction };
type ConfirmOpts = { title?: string; body?: string; confirmLabel?: string; danger?: boolean };
type Ctx = { toast: (text: string, tone?: Tone, action?: ToastAction) => void; confirm: (o: ConfirmOpts) => Promise<boolean> };

const FeedbackCtx = createContext<Ctx | null>(null);

/** Toasts and a confirm dialog, so nothing in the app uses the browser's alert()/confirm() popups. */
export function useFeedback() {
  const ctx = useContext(FeedbackCtx);
  if (!ctx) throw new Error("useFeedback must be used inside <FeedbackProvider>");
  return ctx;
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const t = useTranslations("common");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [ask, setAsk] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const nextId = useRef(1);

  const toast = useCallback((text: string, tone: Tone = "success", action?: ToastAction) => {
    const id = nextId.current++;
    setToasts((all) => [...all.slice(-2), { id, text, tone, action }]);
    setTimeout(() => setToasts((all) => all.filter((x) => x.id !== id)), action ? 6000 : tone === "error" ? 6000 : 3000);
  }, []);
  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setAsk({ ...o, resolve })), []);
  const answer = (v: boolean) => {
    ask?.resolve(v);
    setAsk(null);
  };

  const icon = { success: CheckCircle2, error: XCircle, info: Info };
  return (
    <FeedbackCtx.Provider value={{ toast, confirm }}>
      {children}

      {/* toasts: above the phone's bottom bar, top-right on wide screens */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4 md:inset-x-auto md:bottom-6 md:right-6 md:items-end"
      >
        {toasts.map((x) => {
          const Icon = icon[x.tone];
          return (
            <div
              key={x.id}
              role={x.tone === "error" ? "alert" : "status"}
              className={cn(
                "pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg animate-in",
                x.tone === "success" && "border-brand-200 bg-white text-slate-800 dark:border-brand-900 dark:bg-slate-900 dark:text-slate-100",
                x.tone === "error" && "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200",
                x.tone === "info" && "border-slate-200 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100",
              )}
            >
              <Icon className={cn("mt-px size-5 shrink-0", x.tone === "success" && "text-brand-600", x.tone === "info" && "text-sky-600")} />
              <span className="flex-1">{x.text}</span>
              {x.action && (
                <button
                  type="button"
                  onClick={() => {
                    x.action!.onClick();
                    setToasts((all) => all.filter((y) => y.id !== x.id));
                  }}
                  className="-my-1 rounded-lg px-2 py-1 font-semibold text-brand-700 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-950/50"
                >
                  {x.action.label}
                </button>
              )}
              <button
                type="button"
                aria-label={t("close")}
                onClick={() => setToasts((all) => all.filter((y) => y.id !== x.id))}
                className="-mr-1 rounded p-0.5 opacity-60 hover:opacity-100"
              >
                <X className="size-4" />
              </button>
            </div>
          );
        })}
      </div>

      <Modal open={!!ask} onClose={() => answer(false)} title={ask?.title ?? t("areYouSure")}>
        <div className="space-y-5">
          <div className="flex gap-3">
            <span
              className={cn(
                "grid size-10 shrink-0 place-items-center rounded-full",
                ask?.danger ? "bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400" : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
              )}
            >
              <AlertTriangle className="size-5" />
            </span>
            <p className="pt-2 text-slate-600 dark:text-slate-300">{ask?.body}</p>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" className={btn.secondary} onClick={() => answer(false)}>
              {t("cancel")}
            </button>
            <button type="button" autoFocus className={ask?.danger ? btn.dangerSolid : btn.primary} onClick={() => answer(true)}>
              {ask?.confirmLabel ?? t("yesContinue")}
            </button>
          </div>
        </div>
      </Modal>
    </FeedbackCtx.Provider>
  );
}
