"use client";

import { useTranslations } from "next-intl";
import { btn } from "./ui";

/** Print (→ Save as PDF on phones/PCs) and CSV download that opens in Excel with Bangla intact. */
export function ReportActions({ filename, rows }: { filename: string; rows: (string | number)[][] }) {
  const t = useTranslations("report");
  const download = () => {
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n"); // BOM → Excel reads UTF-8
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: filename });
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="no-print flex flex-wrap gap-2">
      <button type="button" className={btn.secondary} onClick={() => window.print()}>
        {t("print")}
      </button>
      <button type="button" className={btn.secondary} onClick={download}>
        {t("exportCsv")}
      </button>
    </div>
  );
}
