"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { btn } from "./ui";

export function CopyButton({ text, label }: { text: string; label?: string }) {
  const t = useTranslations("common");
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={btn.small}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          window.prompt("", text);
        }
      }}
    >
      {copied ? t("copied") : (label ?? t("copy"))}
    </button>
  );
}

export function WhatsAppButton({ text, label }: { text: string; label: string }) {
  return (
    <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer" className={btn.small}>
      {label}
    </a>
  );
}
