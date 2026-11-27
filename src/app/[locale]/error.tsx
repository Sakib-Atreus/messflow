"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { btn } from "@/components/ui";

const KEY = "mf_stale_reload";

/**
 * After a deploy (or a dev-server restart) an already-open tab still holds the old page, and its
 * buttons call server actions that no longer exist. Reload once to pick up the new version.
 */
function isStale(error: Error) {
  return error.name === "UnrecognizedActionError" || /Server Action .* was not found|failed-to-find-server-action/i.test(error.message);
}

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("errorPage");
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    if (!isStale(error)) {
      console.error(error);
      return;
    }
    // guard against a reload loop if the new version fails the same way
    let last = 0;
    try {
      last = Number(sessionStorage.getItem(KEY) ?? 0);
      sessionStorage.setItem(KEY, String(Date.now()));
    } catch {}
    if (Date.now() - last > 15_000) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- show "reloading…" just before the page reloads
      setReloading(true);
      window.location.reload();
    }
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
        {reloading ? <RefreshCw className="size-7 animate-spin" /> : <TriangleAlert className="size-7" />}
      </span>
      <div>
        <h1 className="text-xl font-bold">{reloading ? t("updating") : t("title")}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{reloading ? t("updatingBody") : t("body")}</p>
      </div>
      {!reloading && (
        <div className="flex gap-2">
          <button type="button" onClick={reset} className={btn.primary}>
            {t("retry")}
          </button>
          <button type="button" onClick={() => window.location.reload()} className={btn.secondary}>
            {t("reload")}
          </button>
        </div>
      )}
    </div>
  );
}
