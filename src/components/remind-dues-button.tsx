"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { BellRing, Check, MessageCircle, X } from "lucide-react";
import { remindDues } from "@/lib/actions/features";
import { fmtMoney } from "@/lib/format";
import type { DueResult } from "@/lib/notify";
import { Modal } from "./modal";
import { Badge, btn, cn, inputClass, Spinner } from "./ui";

const NOTE_MAX = 200;

/** "01712…" → "8801712…" for wa.me links */
const waPhone = (p: string | null) => {
  const d = (p ?? "").replace(/\D/g, "");
  return d.startsWith("880") ? d : d.startsWith("0") ? `88${d}` : d.length >= 10 ? `880${d}` : "";
};

export function RemindDuesButton({ dues, messName }: { dues: DueResult[]; messName: string }) {
  const t = useTranslations();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [results, setResults] = useState<DueResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const money = (n: number) => fmtMoney(locale, n);
  const reachBadge = (r: DueResult) =>
    r.reach === "app" ? (
      <Badge tone="green">{t("dues.reachApp")}</Badge>
    ) : r.reach === "notifications_off" ? (
      <Badge tone="amber">{t("dues.reachOff")}</Badge>
    ) : (
      <Badge>{t("dues.reachNoApp")}</Badge>
    );
  const selected = dues.filter((d) => picked.has(d.member_id));
  const willGet = selected.filter((d) => d.reach === "app").length;
  const messageFor = (d: DueResult) =>
    [t("dues.waText", { name: d.name, amount: money(d.amount), mess: messName }), note.trim() && `📝 ${note.trim()}`].filter(Boolean).join("\n");
  const groupText = [
    t("dues.waGroupTitle", { mess: messName }),
    ...(results ?? selected).map((d) => `• ${d.name}: ${money(d.amount)}`),
    note.trim() && `\n📝 ${note.trim()}`,
  ].filter(Boolean).join("\n");

  const openModal = () => {
    setPicked(new Set(dues.map((d) => d.member_id)));
    setResults(null);
    setError(null);
    setOpen(true);
  };
  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const send = () =>
    start(async () => {
      setError(null);
      const r = await remindDues({ note, memberIds: [...picked] });
      if (r.error) setError(t(`errors.${r.error}`));
      else setResults(r.results ?? []);
    });

  const waLink = (d: DueResult) => {
    const phone = waPhone(d.phone);
    return `https://wa.me/${phone}?text=${encodeURIComponent(messageFor(d))}`;
  };

  return (
    <>
      <button type="button" className={btn.small} onClick={openModal}>
        <BellRing className="size-4" /> {t("dashboard.remindDues")}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={results ? t("dues.doneTitle") : t("dues.title")}>
        {!results ? (
          <div className="space-y-4">
            <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
              {dues.map((d) => (
                <li key={d.member_id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/60">
                    <input
                      type="checkbox"
                      checked={picked.has(d.member_id)}
                      onChange={() => toggle(d.member_id)}
                      className="size-4 accent-brand-600"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{d.name}</span>
                      <span className="mt-0.5 block">{reachBadge(d)}</span>
                    </span>
                    <span className="font-semibold text-red-600 tabular-nums dark:text-red-400">{money(d.amount)}</span>
                  </label>
                </li>
              ))}
            </ul>

            <label className="block space-y-1">
              <span className="flex justify-between text-sm font-medium text-slate-700 dark:text-slate-300">
                {t("dues.note")}
                <span className="font-normal text-slate-400">
                  {note.length}/{NOTE_MAX}
                </span>
              </span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
                rows={3}
                placeholder={t("dues.notePlaceholder")}
                className={inputClass}
              />
            </label>

            {selected[0] && (
              <div className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">{t("dues.preview")}</div>
                <div className="font-semibold">{t("push.duesTitle")}</div>
                <div className="whitespace-pre-line text-slate-600 dark:text-slate-300">
                  {t("push.duesBody", { amount: money(selected[0].amount), mess: messName })}
                  {note.trim() && `\n📝 ${note.trim()}`}
                </div>
              </div>
            )}

            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

            <p className="text-sm text-slate-500">{t("dues.willGet", { count: willGet, total: selected.length })}</p>
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" className={btn.secondary} onClick={() => setOpen(false)}>
                {t("common.cancel")}
              </button>
              <button type="button" className={btn.primary} disabled={pending || selected.length === 0} onClick={send}>
                {pending ? <Spinner /> : <BellRing className="size-4" />} {t("dues.send")}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div
              className={cn(
                "rounded-2xl px-4 py-3",
                results.some((r) => r.sent)
                  ? "bg-brand-50 text-brand-900 dark:bg-brand-950/50 dark:text-brand-200"
                  : "bg-amber-50 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200",
              )}
            >
              <div className="text-2xl font-bold tabular-nums">
                {results.filter((r) => r.sent).length} / {results.length}
              </div>
              <div className="text-sm">{t("dues.sentSummary")}</div>
            </div>

            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
              {results.map((r) => (
                <li key={r.member_id} className="flex items-center gap-3 px-3 py-2.5">
                  <span
                    className={cn(
                      "grid size-7 shrink-0 place-items-center rounded-full",
                      r.sent ? "bg-brand-100 text-brand-700 dark:bg-brand-950 dark:text-brand-300" : "bg-slate-100 text-slate-500 dark:bg-slate-800",
                    )}
                  >
                    {r.sent ? <Check className="size-4" /> : <X className="size-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{r.name}</span>
                    <span className="block text-xs text-slate-500">
                      {r.sent ? t("dues.gotIt") : r.reach === "no_app" ? t("dues.whyNoApp") : t("dues.whyOff")}
                    </span>
                  </span>
                  {!r.sent && (
                    <a href={waLink(r)} target="_blank" rel="noopener noreferrer" className={btn.small} title={t("dues.whatsapp")}>
                      <MessageCircle className="size-4" /> {t("dues.whatsapp")}
                    </a>
                  )}
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap justify-end gap-2">
              <a
                href={`https://wa.me/?text=${encodeURIComponent(groupText)}`}
                target="_blank"
                rel="noopener noreferrer"
                className={btn.secondary}
              >
                <MessageCircle className="size-4" /> {t("dues.waGroup")}
              </a>
              <button type="button" className={btn.primary} onClick={() => setOpen(false)}>
                {t("common.close")}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
