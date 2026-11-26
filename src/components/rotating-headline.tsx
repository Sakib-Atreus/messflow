"use client";

import { useEffect, useState } from "react";
import { cn } from "./ui";

const EVERY_MS = 4000;

/**
 * The landing headline: shows one line at a time and fades to the next every 4 seconds.
 * All lines sit in the same grid cell, so the height is that of the tallest one and nothing
 * below jumps. Dots let people pick a line. No movement for people who turn animations off,
 * and it pauses while the tab is in the background. The first line is what search engines and
 * link previews read.
 */
export function RotatingHeadline({ lines, className, dotLabels }: { lines: string[]; className?: string; dotLabels: string[] }) {
  const [active, setActive] = useState(0);
  const [tick, setTick] = useState(0); // restarts the timer after a dot is tapped

  useEffect(() => {
    if (lines.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") setActive((a) => (a + 1) % lines.length);
    }, EVERY_MS);
    return () => clearInterval(id);
  }, [lines.length, tick]);

  return (
    <div>
      <h1 className={cn("grid", className)}>
        {lines.map((line, i) => (
          <span
            key={line}
            aria-hidden={i !== active}
            className={cn(
              "col-start-1 row-start-1 self-center transition-opacity duration-700 ease-in-out motion-reduce:transition-none",
              i === active ? "opacity-100" : "pointer-events-none opacity-0",
            )}
          >
            {line}
          </span>
        ))}
      </h1>
      {lines.length > 1 && (
        <div className="mt-4 flex justify-center gap-2 lg:justify-start">
          {lines.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={dotLabels[i]}
              aria-pressed={i === active}
              onClick={() => {
                setActive(i);
                setTick((x) => x + 1);
              }}
              className="grid size-6 place-items-center rounded-full"
            >
              <span
                className={cn(
                  "block h-2 rounded-full transition-all duration-300",
                  i === active ? "w-6 bg-brand-600 dark:bg-brand-400" : "w-2 bg-slate-300 hover:bg-slate-400 dark:bg-slate-700",
                )}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
