"use client";

import { useTransition } from "react";
import { switchMess } from "@/lib/actions/mess";

export function MessSwitcher({ current, options }: { current: string; options: { id: string; name: string }[] }) {
  const [pending, start] = useTransition();
  const name = options.find((o) => o.id === current)?.name;
  if (options.length < 2) return <span className="truncate font-semibold">{name}</span>;
  return (
    <select
      value={current}
      disabled={pending}
      onChange={(e) => start(() => switchMess(e.target.value))}
      className="max-w-48 truncate rounded-md bg-transparent font-semibold"
    >
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
}
