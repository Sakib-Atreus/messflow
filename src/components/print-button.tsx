"use client";

import { Printer } from "lucide-react";
import { btn } from "./ui";

/** Print the page (→ "Save as PDF" on phones and computers). */
export function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" className={btn.small} onClick={() => window.print()}>
      <Printer className="size-4" /> {label}
    </button>
  );
}
