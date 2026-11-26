"use client";

import { useState, type ReactNode } from "react";
import { ChefHat, Info, UserPlus } from "lucide-react";
import { Modal } from "./modal";
import { btn } from "./ui";

const ICONS = { add: UserPlus, details: Info, chef: ChefHat } as const;

/**
 * A button that opens its content in a side panel (bottom sheet on phones), or a centred dialog with
 * `side={false}`. Content stays mounted while open. `badge` shows a red count on the button.
 */
export function Drawer({
  label, title, icon, className, children, side = true, badge,
}: { label: ReactNode; title: ReactNode; icon?: keyof typeof ICONS; className?: string; children: ReactNode; side?: boolean; badge?: number }) {
  const [open, setOpen] = useState(false);
  const Icon = icon ? ICONS[icon] : null;
  return (
    <>
      <button type="button" className={className ?? btn.primary} onClick={() => setOpen(true)} aria-haspopup="dialog">
        {Icon && <Icon className="size-4" />}
        {label}
        {!!badge && (
          <span className="grid min-w-5 place-items-center rounded-full bg-red-600 px-1.5 text-xs font-semibold leading-5 text-white">{badge}</span>
        )}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={title} side={side}>
        {open && children}
      </Modal>
    </>
  );
}
