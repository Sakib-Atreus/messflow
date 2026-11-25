import { getTranslations, setRequestLocale } from "next-intl/server";
import { ActionButton } from "@/components/action-button";
import { deleteWithUndo } from "@/lib/actions/undo";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, btn, Card, Checkbox, Empty, Field, inputClass, PageTitle } from "@/components/ui";
import { addNotice, setNoticePinned } from "@/lib/actions/features";
import { getContext } from "@/lib/mess";
import { fmtDate } from "@/lib/format";
import { getMembers } from "@/lib/queries";

type Notice = { id: string; title: string; body: string | null; pinned: boolean; created_by: string | null; created_at: string };

export default async function NoticesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { supabase, mess, can } = await getContext();
  const isStaff = can("notices");
  const t = await getTranslations();

  const [members, { data }] = await Promise.all([
    getMembers(supabase, mess.id),
    supabase
      .from("notices")
      .select("id, title, body, pinned, created_by, created_at")
      .eq("mess_id", mess.id)
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  const notices = (data ?? []) as Notice[];
  const author = (uid: string | null) => members.find((m) => m.user_id === uid)?.display_name;
  const dateOf = (ts: string) =>
    fmtDate(locale, new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(new Date(ts)), {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

  return (
    <div className="space-y-5">
      <PageTitle>{t("notices.title")}</PageTitle>

      {isStaff && (
        <Card title={t("notices.add")}>
          <ActionForm action={addNotice}>
            <Field label={t("notices.titleField")}>
              <input name="title" required maxLength={120} className={inputClass} />
            </Field>
            <Field label={`${t("notices.body")} (${t("common.optional")})`}>
              <textarea name="body" rows={3} maxLength={2000} className={inputClass} />
            </Field>
            <div className="flex flex-wrap gap-4">
              <Checkbox name="pinned" label={t("notices.pin")} />
              <Checkbox name="notify" label={t("notices.notify")} defaultChecked />
            </div>
            <SubmitButton>{t("notices.add")}</SubmitButton>
          </ActionForm>
        </Card>
      )}

      {notices.length === 0 ? (
        <Card>
          <Empty>{t("notices.none")}</Empty>
        </Card>
      ) : (
        <div className="space-y-3">
          {notices.map((n) => (
            <Card key={n.id} className={n.pinned ? "border-amber-300 dark:border-amber-800" : undefined}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold">
                    {n.pinned && <span className="mr-1">📌</span>}
                    {n.title}
                  </h2>
                  <div className="text-xs text-slate-500">
                    {dateOf(n.created_at)}
                    {author(n.created_by) && ` · ${t("notices.by", { name: author(n.created_by)! })}`}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {n.pinned && <Badge tone="amber">{t("notices.pinned")}</Badge>}
                  {isStaff && (
                    <>
                      <ActionButton action={setNoticePinned.bind(null, n.id, !n.pinned)} icon={n.pinned ? "unpin" : "pin"}>
                        {n.pinned ? t("notices.unpin") : t("notices.pin")}
                      </ActionButton>
                      <ActionButton action={deleteWithUndo.bind(null, "notice", n.id)} className={btn.danger} icon="delete">
                        {t("common.delete")}
                      </ActionButton>
                    </>
                  )}
                </div>
              </div>
              {n.body && <p className="mt-2 whitespace-pre-line text-slate-700 dark:text-slate-300">{n.body}</p>}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
