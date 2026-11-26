"use client";

import { createContext, startTransition, useActionState, useContext, useEffect, useRef, type FormEvent, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import type { ActionResult } from "@/lib/errors";
import { CheckCircle2, XCircle } from "lucide-react";
import { useFeedback } from "./feedback";
import { btn, cn, Spinner } from "./ui";

type Action = (prev: ActionResult, fd: FormData) => Promise<ActionResult>;

/** Lets SubmitButton show the spinner (we submit by hand, so useFormStatus doesn't see it). */
const PendingCtx = createContext<boolean | null>(null);

export function ActionForm({
  action,
  children,
  className,
  reset = true,
  onDone,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  reset?: boolean;
  onDone?: () => void;
}) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(action, {} as ActionResult);
  // Submit by hand instead of <form action>: React would otherwise clear every field after each
  // submit - even when the server says "error", so people would have to retype everything.
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    startTransition(() => formAction(fd));
  };
  const ref = useRef<HTMLFormElement>(null);

  const { toast } = useFeedback();
  const errRef = useRef<HTMLParagraphElement>(null);
  const handled = useRef<ActionResult | null>(null);
  useEffect(() => {
    // react once per submit result (callbacks passed inline change on every render)
    if (handled.current === state) return;
    handled.current = state;
    if (state.ok) {
      if (reset) ref.current?.reset();
      onDone?.();
      // plain "saved" → quick toast; anything worth reading (a message, login details) stays in the form
      if (!state.message && !state.detail) toast(t("common.saved"));
    }
    if (state.error) errRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [state, reset, onDone, toast, t]);

  return (
    <PendingCtx.Provider value={pending}>
    <form ref={ref} onSubmit={onSubmit} className={cn("space-y-3", className)}>
      {children}
      {state.error && (
        <p ref={errRef} role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/60 dark:text-red-300">
          <XCircle className="mt-px size-4 shrink-0" />
          {t(`errors.${state.error}`)}
        </p>
      )}
      {state.ok && (state.message || state.detail) && (
        <p role="status" className="rounded-xl border border-brand-200 bg-brand-50 px-3 py-2.5 text-sm text-brand-800 dark:border-brand-900 dark:bg-brand-950/60 dark:text-brand-200">
          <CheckCircle2 className="mr-1.5 inline size-4 -translate-y-px" />
          {state.message
            ? t((state.message.includes(".") ? state.message : `auth.${state.message}`) as "auth.checkEmail")
            : t("common.saved")}
          {state.detail && (
            <span className="mt-1 block select-all rounded-md bg-white/70 px-2 py-1 font-mono text-slate-900 dark:bg-slate-900/60 dark:text-slate-100">
              {state.detail}
            </span>
          )}
        </p>
      )}
    </form>
    </PendingCtx.Provider>
  );
}

/** Form submit with a spinner while saving (label stays, so the button doesn't jump). */
export function SubmitButton({ children, className }: { children: ReactNode; className?: string }) {
  const status = useFormStatus();
  const ctx = useContext(PendingCtx);
  const pending = ctx ?? status.pending;
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={className ?? btn.primary}>
      {pending && <Spinner />}
      {children}
    </button>
  );
}
