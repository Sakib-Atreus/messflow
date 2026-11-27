"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Mic, Send, Square, Trash2 } from "lucide-react";
import { useFeedback } from "@/components/feedback";
import { btn, cn, inputClass, Spinner } from "@/components/ui";
import { sendNeeds } from "@/lib/actions/needs";
import { NEED_ITEMS } from "@/lib/needs";
import type { ActionResult } from "@/lib/errors";

const MAX_SECONDS = 30;

/** Khala's "বাজারে লাগবে": tap finished items, add a line or a short voice message, send. */
export function NeedsPanel({ messId, pending }: { messId: string; pending: string[] }) {
  const t = useTranslations("needs");
  const tErr = useTranslations("errors");
  const { toast } = useFeedback();
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [voice, setVoice] = useState<{ blob: Blob; url: string; type: string } | null>(null);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [busy, startBusy] = useTransition();
  const rec = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
    rec.current?.stream.getTracks().forEach((tr) => tr.stop());
  }, []);

  const toggle = (key: string) => setPicked((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]));

  const startRecording = async () => {
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) return toast(t("micUnsupported"), "error");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return toast(t("micBlocked"), "error");
    }
    const type = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
    const r = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const chunks: Blob[] = [];
    r.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    r.onstop = () => {
      stream.getTracks().forEach((tr) => tr.stop());
      const mime = (r.mimeType || type || "audio/webm").split(";")[0];
      const blob = new Blob(chunks, { type: mime });
      if (blob.size) setVoice({ blob, url: URL.createObjectURL(blob), type: mime });
      setRecording(false);
      if (timer.current) clearInterval(timer.current);
    };
    rec.current = r;
    r.start();
    setSeconds(0);
    setRecording(true);
    timer.current = setInterval(() => {
      setSeconds((s) => {
        if (s + 1 >= MAX_SECONDS && r.state === "recording") r.stop();
        return s + 1;
      });
    }, 1000);
  };
  const stopRecording = () => {
    if (rec.current?.state === "recording") rec.current.stop();
  };

  const send = () =>
    startBusy(async () => {
      let voicePath = "";
      if (voice) {
        const ext = voice.type.includes("mp4") ? "m4a" : voice.type.includes("ogg") ? "ogg" : "webm";
        voicePath = `${messId}/${Date.now()}.${ext}`;
        // the upload client loads only when there is a voice message (keeps this page light)
        const { createBrowserSupabase } = await import("@/lib/supabase/client");
        const { error } = await createBrowserSupabase().storage.from("voice").upload(voicePath, voice.blob, { contentType: voice.type });
        if (error) return toast(t("uploadFailed"), "error");
      }
      const fd = new FormData();
      picked.forEach((k) => fd.append("items", k));
      fd.set("note", note);
      fd.set("voice", voicePath);
      const r: ActionResult = await sendNeeds({}, fd);
      if (r.error) return toast(tErr(r.error), "error");
      toast(t("sent"), "success");
      setPicked([]);
      setNote("");
      setVoice(null);
      router.refresh();
    });

  const canSend = picked.length > 0 || note.trim().length > 0 || !!voice;

  return (
    <section className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-xl font-semibold">🛒 {t("title")}</h2>
      <p className="mt-1 text-base text-slate-500">{t("khalaHelp")}</p>

      <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
        {NEED_ITEMS.map(({ key, emoji }) => {
          const waiting = pending.includes(key);
          const on = picked.includes(key);
          return (
            <button
              key={key}
              type="button"
              data-need={key}
              disabled={waiting || busy}
              aria-pressed={on}
              title={waiting ? t("sentAlready") : undefined}
              onClick={() => toggle(key)}
              className={cn(
                "relative flex min-h-20 flex-col items-center justify-center gap-1 rounded-2xl border-2 px-1 py-2 text-base font-medium transition",
                waiting
                  ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
                  : on
                    ? "border-brand-600 bg-brand-50 text-brand-800 dark:border-brand-500 dark:bg-brand-950/50 dark:text-brand-200"
                    : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900",
              )}
            >
              <span className="text-2xl leading-none" aria-hidden>{emoji}</span>
              <span className="text-center leading-tight">{t(`items.${key}`)}</span>
              {waiting && <span className="absolute right-1.5 top-1 text-sm" aria-label={t("sentAlready")}>⏳</span>}
              {on && <span className="absolute right-1.5 top-1 text-sm text-brand-600" aria-hidden>✓</span>}
            </button>
          );
        })}
      </div>

      <label className="mt-4 block">
        <span className="mb-1 block text-base font-medium">{t("other")}</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder={t("otherPlaceholder")} className={cn(inputClass, "text-lg")} />
      </label>

      <div className="mt-3">
        {recording ? (
          <button type="button" onClick={stopRecording} className={cn(btn.danger, "min-h-12 w-full text-base")}>
            <Square className="size-5 fill-current" /> {t("recording")} {seconds}s / {MAX_SECONDS}s
          </button>
        ) : voice ? (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-slate-50 p-2 dark:bg-slate-800/60">
            <audio src={voice.url} controls className="h-10 min-w-0 flex-1" />
            <button type="button" onClick={() => setVoice(null)} className={btn.small} aria-label={t("deleteVoice")}>
              <Trash2 className="size-4" /> {t("deleteVoice")}
            </button>
          </div>
        ) : (
          <button type="button" onClick={startRecording} disabled={busy} className={cn(btn.secondary, "min-h-12 w-full text-base")}>
            <Mic className="size-5" /> {t("record")}
          </button>
        )}
      </div>

      <button type="button" onClick={send} disabled={!canSend || busy || recording} className={cn(btn.primary, "mt-4 min-h-14 w-full text-lg")}>
        {busy ? <Spinner /> : <Send className="size-5" />} {t("send")}
      </button>
    </section>
  );
}
