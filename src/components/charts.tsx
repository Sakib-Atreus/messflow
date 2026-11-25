"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocale } from "next-intl";
import { fmtMoney, fmtNumber } from "@/lib/format";

// Small SVG charts drawn in real pixels (text never scales), sized to their container.
// Colors come from CSS variables (--chart-*) so light/dark mode switch automatically.

type Kind = "money" | "number";

function useFmt(kind: Kind) {
  const locale = useLocale();
  return (n: number) => (kind === "money" ? fmtMoney(locale, Math.round(n)) : fmtNumber(locale, n, 1));
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** 0, nice step, ... covering max. */
function niceTicks(max: number, count = 4) {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) out.push(v);
  if (out[out.length - 1] < max) out.push(out[out.length - 1] + step);
  return out;
}

function Tooltip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  // keep inside the chart horizontally
  const left = Math.min(Math.max(x, 70), Math.max(width - 70, 70));
  return (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-800"
      style={{ left, top: y - 8 }}
    >
      {children}
    </div>
  );
}

/** Hidden table so screen readers get the numbers. */
function SrTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="sr-only">
      <thead>
        <tr>{head.map((h) => <th key={h}>{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}

// ---------------------------------------------------------------- vertical bars (per day)
export function DailyBars({
  data, kind = "number", label, height = 180, highlight,
}: {
  data: { key: string; tick: string; title: string; value: number; note?: string }[];
  kind?: Kind;
  label: string;
  height?: number;
  highlight?: string;
}) {
  const fmt = useFmt(kind);
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const padL = 34, padB = 22, padT = 8;
  const ticks = niceTicks(Math.max(...data.map((d) => d.value), 0));
  const top = ticks[ticks.length - 1] || 1;
  const plotW = Math.max(width - padL, 0), plotH = height - padB - padT;
  const slot = data.length ? plotW / data.length : 0;
  const barW = Math.max(Math.min(slot - 2, 18), 2); // 2px gap between bars
  const y = (v: number) => padT + plotH - (v / top) * plotH;
  const labelEvery = Math.ceil(data.length / Math.max(Math.floor(plotW / 34), 1));

  return (
    <div ref={ref} className="relative" onMouseLeave={() => setHover(null)}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={label}>
          {ticks.map((tv) => (
            <g key={tv}>
              <line x1={padL} x2={width} y1={y(tv)} y2={y(tv)} stroke="var(--chart-grid)" />
              <text x={padL - 6} y={y(tv)} dy="0.32em" textAnchor="end" fontSize="10" fill="var(--chart-axis)">
                {fmt(tv)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const x = padL + i * slot + (slot - barW) / 2;
            const h = Math.max((d.value / top) * plotH, d.value > 0 ? 2 : 0);
            const r = Math.min(4, barW / 2, h);
            const dim = hover !== null && hover !== i;
            return (
              <g key={d.key} onMouseEnter={() => setHover(i)} onClick={() => setHover(i)}>
                {/* hit target: full column height */}
                <rect x={padL + i * slot} y={padT} width={slot} height={plotH} fill="transparent" />
                {h > 0 && (
                  <path
                    d={`M${x},${padT + plotH} v${-(h - r)} q0,${-r} ${r},${-r} h${barW - 2 * r} q${r},0 ${r},${r} v${h - r} z`}
                    fill="var(--chart-1)"
                    opacity={dim ? 0.35 : d.key === highlight || hover === i ? 1 : 0.85}
                  />
                )}
                {i % labelEvery === 0 && (
                  <text x={x + barW / 2} y={height - 6} textAnchor="middle" fontSize="10" fill="var(--chart-axis)">
                    {d.tick}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      {hover !== null && data[hover] && (
        <Tooltip x={padL + hover * slot + slot / 2} y={y(data[hover].value)} width={width}>
          <div className="font-medium">{data[hover].title}</div>
          <div className="tabular-nums">{fmt(data[hover].value)}{data[hover].note && <span className="text-slate-500"> · {data[hover].note}</span>}</div>
        </Tooltip>
      )}
      <SrTable head={["", label]} rows={data.map((d) => [d.title, fmt(d.value)])} />
    </div>
  );
}

// ---------------------------------------------------------------- cumulative lines
export function CumulativeLines({
  x, series, kind = "money", height = 200, label,
}: {
  x: { key: string; tick: string; title: string }[];
  series: { name: string; color: "1" | "2"; values: number[] }[];
  kind?: Kind;
  height?: number;
  label: string;
}) {
  const fmt = useFmt(kind);
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const padL = 52, padR = 12, padB = 22, padT = 10;
  const max = Math.max(...series.flatMap((s) => s.values), 0);
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] || 1;
  const plotW = Math.max(width - padL - padR, 0), plotH = height - padB - padT;
  const n = x.length;
  const px = (i: number) => padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const py = (v: number) => padT + plotH - (v / top) * plotH;
  const labelEvery = Math.ceil(n / Math.max(Math.floor(plotW / 40), 1));
  const paths = useMemo(
    () => series.map((s) => s.values.map((v, i) => `${i ? "L" : "M"}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join("")),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [series, width, top],
  );

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientX - rect.left - padL) / (plotW || 1);
    setHover(Math.min(Math.max(Math.round(rel * (n - 1)), 0), n - 1));
  };

  return (
    <div ref={ref} className="relative">
      {width > 0 && n > 0 && (
        <svg width={width} height={height} role="img" aria-label={label} onPointerMove={onMove} onPointerLeave={() => setHover(null)} className="touch-pan-y">
          {ticks.map((tv) => (
            <g key={tv}>
              <line x1={padL} x2={width - padR} y1={py(tv)} y2={py(tv)} stroke="var(--chart-grid)" />
              <text x={padL - 6} y={py(tv)} dy="0.32em" textAnchor="end" fontSize="10" fill="var(--chart-axis)">
                {fmt(tv)}
              </text>
            </g>
          ))}
          {x.map((d, i) =>
            i % labelEvery === 0 ? (
              <text key={d.key} x={px(i)} y={height - 6} textAnchor="middle" fontSize="10" fill="var(--chart-axis)">
                {d.tick}
              </text>
            ) : null,
          )}
          {hover !== null && <line x1={px(hover)} x2={px(hover)} y1={padT} y2={padT + plotH} stroke="var(--chart-axis)" strokeDasharray="3 3" />}
          {series.map((s, si) => (
            <path key={s.name} d={paths[si]} fill="none" stroke={`var(--chart-${s.color})`} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {hover !== null &&
            series.map((s) => (
              <circle key={s.name} cx={px(hover)} cy={py(s.values[hover])} r="4.5" fill={`var(--chart-${s.color})`} stroke="var(--chart-surface)" strokeWidth="2" />
            ))}
        </svg>
      )}
      {hover !== null && x[hover] && (
        <Tooltip x={px(hover)} y={py(Math.max(...series.map((s) => s.values[hover])))} width={width}>
          <div className="mb-0.5 font-medium">{x[hover].title}</div>
          {series.map((s) => (
            <div key={s.name} className="flex items-center gap-1.5 tabular-nums">
              <span className="inline-block h-0.5 w-3 rounded" style={{ background: `var(--chart-${s.color})` }} />
              {s.name}: <b>{fmt(s.values[hover])}</b>
            </div>
          ))}
        </Tooltip>
      )}
      <SrTable head={["", ...series.map((s) => s.name)]} rows={x.map((d, i) => [d.title, ...series.map((s) => fmt(s.values[i]))])} />
    </div>
  );
}

export function Legend({ items }: { items: { name: string; color: "1" | "2" | "neg"; line?: boolean }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
      {items.map((i) => (
        <span key={i.name} className="inline-flex items-center gap-1.5">
          <span
            className={i.line ? "inline-block h-0.5 w-4 rounded" : "inline-block size-2.5 rounded-sm"}
            style={{ background: `var(--chart-${i.color})` }}
          />
          {i.name}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- horizontal bars (breakdown)
export function BreakdownBars({ rows, kind = "money", label }: { rows: { label: string; value: number }[]; kind?: Kind; label: string }) {
  const fmt = useFmt(kind);
  const total = rows.reduce((a, r) => a + r.value, 0);
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div role="list" aria-label={label} className="space-y-3">
      {rows.map((r) => (
        <div key={r.label} role="listitem" title={`${r.label}: ${fmt(r.value)}`}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
            <span className="truncate text-slate-700 dark:text-slate-300">{r.label}</span>
            <span className="shrink-0 font-semibold tabular-nums">
              {fmt(r.value)}
              <span className="ml-1.5 text-xs font-normal text-slate-500">{total ? Math.round((r.value / total) * 100) : 0}%</span>
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800">
            <div className="h-2 rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: "var(--chart-1)" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- diverging bars (balances)
export function BalanceBars({
  rows, label, posLabel, negLabel, highlight,
}: {
  rows: { id: string; label: string; value: number }[];
  label: string;
  posLabel: string;
  negLabel: string;
  highlight?: string;
}) {
  const fmt = useFmt("money");
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 1);
  return (
    <div role="list" aria-label={label} className="space-y-1.5">
      {rows.map((r) => {
        const pct = (Math.abs(r.value) / max) * 50;
        const owes = r.value < -0.005;
        return (
          <div
            key={r.id}
            role="listitem"
            title={`${r.label}: ${owes ? negLabel : posLabel} ${fmt(Math.abs(r.value))}`}
            className={`grid grid-cols-[minmax(4.5rem,7rem)_1fr_auto] items-center gap-2 rounded-lg px-1 py-0.5 text-sm ${r.id === highlight ? "bg-brand-50 dark:bg-brand-950/40" : ""}`}
          >
            <span className="truncate text-slate-700 dark:text-slate-300">{r.label}</span>
            <div className="relative h-3">
              <div className="absolute inset-y-[-3px] left-1/2 w-px bg-slate-300 dark:bg-slate-600" />
              <div
                className="absolute top-0 h-3"
                style={{
                  width: `${pct}%`,
                  left: owes ? `${50 - pct}%` : "50%",
                  background: owes ? "var(--chart-neg)" : "var(--chart-2)",
                  borderRadius: owes ? "4px 0 0 4px" : "0 4px 4px 0",
                }}
              />
            </div>
            <span className={`w-20 text-right font-semibold tabular-nums ${owes ? "text-red-600 dark:text-red-400" : "text-slate-700 dark:text-slate-200"}`}>
              {owes ? "−" : "+"}
              {fmt(Math.abs(r.value)).replace("−", "")}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- meal money left (can go below zero)
export function WalletChart({
  days, forecast, monthDays, label, words, height = 190,
}: {
  days: { key: string; tick: string; title: string; left: number; mealCost: number; paid: number }[];
  forecast: { key: string; left: number }[];
  /** every day of the month (keys + ticks) so the forecast has room */
  monthDays: { key: string; tick: string; title: string }[];
  label: string;
  /** tooltip words: [meals, paid] */
  words: [string, string];
  height?: number;
}) {
  const fmt = useFmt("money");
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const padL = 56, padR = 10, padB = 22, padT = 10;
  const n = monthDays.length;
  const idx = new Map(monthDays.map((d, i) => [d.key, i]));
  const values = [...days.map((d) => d.left), ...forecast.map((f) => f.left), 0];
  const hi = Math.max(...values), lo = Math.min(...values);
  const span = hi - lo || 1;
  const top = hi + span * 0.08, bottom = lo < 0 ? lo - span * 0.08 : 0;
  const plotW = Math.max(width - padL - padR, 0), plotH = height - padB - padT;
  const px = (i: number) => padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const py = (v: number) => padT + ((top - v) / (top - bottom || 1)) * plotH;
  const zeroY = py(0);
  const line = days.map((d, i) => `${i ? "L" : "M"}${px(idx.get(d.key) ?? i).toFixed(1)},${py(d.left).toFixed(1)}`).join("");
  const area = days.length
    ? `${line}L${px(idx.get(days[days.length - 1].key) ?? 0).toFixed(1)},${zeroY}L${px(idx.get(days[0].key) ?? 0).toFixed(1)},${zeroY}Z`
    : "";
  const fc = forecast.map((f, i) => `${i ? "L" : "M"}${px(idx.get(f.key) ?? 0).toFixed(1)},${py(f.left).toFixed(1)}`).join("");
  const ticks = [top > 0 ? hi : 0, 0, ...(lo < 0 ? [lo] : [])].filter((v, i, a) => a.indexOf(v) === i);
  const labelEvery = Math.ceil(n / Math.max(Math.floor(plotW / 40), 1));
  const clipId = useMemo(() => `w${Math.random().toString(36).slice(2, 8)}`, []);

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - rect.left - padL) / (plotW || 1)) * (n - 1));
    const pos = days.findIndex((d) => d.key === monthDays[Math.min(Math.max(i, 0), n - 1)]?.key);
    setHover(pos >= 0 ? pos : days.length ? days.length - 1 : null);
  };
  const h = hover !== null ? days[hover] : null;

  return (
    <div ref={ref} className="relative">
      {width > 0 && n > 0 && (
        <svg width={width} height={height} role="img" aria-label={label} onPointerMove={onMove} onPointerLeave={() => setHover(null)} className="touch-pan-y">
          <defs>
            <clipPath id={`${clipId}a`}><rect x="0" y="0" width={width} height={Math.max(zeroY, 0)} /></clipPath>
            <clipPath id={`${clipId}b`}><rect x="0" y={zeroY} width={width} height={Math.max(height - zeroY, 0)} /></clipPath>
          </defs>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={padL} x2={width - padR} y1={py(v)} y2={py(v)} stroke={v === 0 ? "var(--chart-axis)" : "var(--chart-grid)"} strokeDasharray={v === 0 ? "4 3" : undefined} />
              <text x={padL - 6} y={py(v)} dy="0.32em" textAnchor="end" fontSize="10" fill="var(--chart-axis)">{fmt(v)}</text>
            </g>
          ))}
          {monthDays.map((d, i) =>
            i % labelEvery === 0 ? (
              <text key={d.key} x={px(i)} y={height - 6} textAnchor="middle" fontSize="10" fill="var(--chart-axis)">{d.tick}</text>
            ) : null,
          )}
          {/* money left: green while positive, orange once it's below zero (owes) */}
          <path d={area} fill="var(--chart-1)" opacity="0.12" clipPath={`url(#${clipId}a)`} />
          <path d={area} fill="var(--chart-neg)" opacity="0.14" clipPath={`url(#${clipId}b)`} />
          <path d={line} fill="none" stroke="var(--chart-1)" strokeWidth="2" strokeLinejoin="round" clipPath={`url(#${clipId}a)`} />
          <path d={line} fill="none" stroke="var(--chart-neg)" strokeWidth="2" strokeLinejoin="round" clipPath={`url(#${clipId}b)`} />
          {fc && <path d={fc} fill="none" stroke="var(--chart-axis)" strokeWidth="1.5" strokeDasharray="5 4" />}
          {/* payment days */}
          {days.map((d, i) =>
            d.paid > 0 ? (
              <circle key={d.key} cx={px(idx.get(d.key) ?? i)} cy={py(d.left)} r="4" fill="var(--chart-2)" stroke="var(--chart-surface)" strokeWidth="2" />
            ) : null,
          )}
          {h && (
            <>
              <line x1={px(idx.get(h.key) ?? 0)} x2={px(idx.get(h.key) ?? 0)} y1={padT} y2={padT + plotH} stroke="var(--chart-axis)" strokeDasharray="3 3" />
              <circle cx={px(idx.get(h.key) ?? 0)} cy={py(h.left)} r="4.5" fill={h.left < 0 ? "var(--chart-neg)" : "var(--chart-1)"} stroke="var(--chart-surface)" strokeWidth="2" />
            </>
          )}
        </svg>
      )}
      {h && (
        <Tooltip x={px(idx.get(h.key) ?? 0)} y={py(h.left)} width={width}>
          <div className="font-medium">{h.title}</div>
          <div className="tabular-nums">{fmt(h.left)}</div>
          {h.mealCost > 0 && <div className="text-slate-500 tabular-nums">− {fmt(h.mealCost)} {words[0]}</div>}
          {h.paid > 0 && <div className="text-sky-700 tabular-nums dark:text-sky-400">+ {fmt(h.paid)} {words[1]}</div>}
        </Tooltip>
      )}
      <SrTable head={["", label]} rows={days.map((d) => [d.title, fmt(d.left)])} />
    </div>
  );
}
