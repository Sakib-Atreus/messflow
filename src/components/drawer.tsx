"use client";

import { useState, type ReactNode } from "react";
import { Info, UserPlus } from "lucide-react";
import { Modal } from "./modal";
import { btn } from "./ui";

const ICONS = { add: UserPlus, details: Info } as const;

/** A button that opens its content in a side panel (bottom sheet on phones). Content stays mounted while open. */
export function Drawer({
  label, title, icon, className, children,
}: { label: ReactNode; title: ReactNode; icon?: keyof typeof ICONS; className?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const Icon = icon ? ICONS[icon] : null;
  return (
    <>
      <button type="button" className={className ?? btn.primary} onClick={() => setOpen(true)} aria-haspopup="dialog">
        {Icon && <Icon className="size-4" />}
        {label}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={title} side>
        {open && children}
      </Modal>
    </>
  );
}
