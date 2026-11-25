"use client";

import { useEffect, useRef, useState } from "react";

export type Series = {
  id: string;
  label: string;
  color: string;
  points: { t: number; v: number }[];
};

type Props = {
  series: Series[];
  formatValue: (v: number) => string;
  formatDate?: (t: number) => string;
  height?: number;
  /** Short description for screen readers, e.g. "Lowest price over 30 days". */
  label: string;
  /** Draw flat steps between points (prices hold until they change). */
  step?: boolean;
};

const PAD = { top: 12, right: 12, bottom: 24, left: 52 };

const defaultDate = (t: number) =>
  new Date(t).toLocaleDateString("nl-BE", { day: "numeric", month: "short" });

export function LineChart({ series, formatValue, formatDate = defaultDate, height = 220, label, step }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<number>();

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(240, entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const visible = series.filter((s) => s.points.length);
  const all = visible.flatMap((s) => s.points);

  const scale = (() => {
    if (!all.length) return undefined;
    const ts = all.map((p) => p.t);
    const vs = all.map((p) => p.v);
    let [t0, t1] = [Math.min(...ts), Math.max(...ts)];
    let [v0, v1] = [Math.min(...vs), Math.max(...vs)];
    if (t0 === t1) [t0, t1] = [t0 - 864e5, t1 + 864e5];
    const padV = (v1 - v0 || v1 * 0.05 || 1) * 0.15;
    [v0, v1] = [v0 - padV, v1 + padV];
    const w = width - PAD.left - PAD.right;
    const h = height - PAD.top - PAD.bottom;
    return {
      t0,
      t1,
      v0,
      v1,
      x: (t: number) => PAD.left + ((t - t0) / (t1 - t0)) * w,
      y: (v: number) => PAD.top + (1 - (v - v0) / (v1 - v0)) * h,
      tAt: (x: number) => t0 + ((x - PAD.left) / w) * (t1 - t0),
    };
  })();

  if (!scale) return null;

  const path = (pts: { t: number; v: number }[]) =>
    pts
      .map((p, i) => {
        const x = scale.x(p.t).toFixed(1);
        const y = scale.y(p.v).toFixed(1);
        if (i === 0) return `M${x},${y}`;
        return step ? `H${x}V${y}` : `L${x},${y}`;
      })
      .join("");

  const ticks = [scale.v0 + (scale.v1 - scale.v0) * 0.15, (scale.v0 + scale.v1) / 2, scale.v1 - (scale.v1 - scale.v0) * 0.15];

  // Value of each series at the hovered time (last point at or before it).
  const at = (s: Series, t: number) => {
    let best = s.points[0];
    for (const p of s.points) if (p.t <= t) best = p;
    return best;
  };
  const hoverT = hover !== undefined ? scale.tAt(hover) : undefined;
  const snapped =
    hoverT !== undefined
      ? all.reduce((a, b) => (Math.abs(b.t - hoverT) < Math.abs(a.t - hoverT) ? b : a)).t
      : undefined;

  function move(clientX: number) {
    const rect = wrap.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.min(Math.max(clientX - rect.left, PAD.left), width - PAD.right);
    setHover(x);
  }

  return (
    <figure className="m-0">
      <div
        ref={wrap}
        className="relative touch-pan-y select-none"
        onPointerMove={(e) => move(e.clientX)}
        onPointerDown={(e) => move(e.clientX)}
        onPointerLeave={() => setHover(undefined)}
      >
        <svg width={width} height={height} role="img" aria-label={label} className="block overflow-visible">
          {ticks.map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={width - PAD.right} y1={scale.y(v)} y2={scale.y(v)} className="stroke-line" />
              <text x={PAD.left - 8} y={scale.y(v)} dy="0.32em" textAnchor="end" className="fill-muted text-[11px] tabular-nums">
                {formatValue(v)}
              </text>
            </g>
          ))}
          <text x={PAD.left} y={height - 6} className="fill-muted text-[11px]">
            {formatDate(scale.t0)}
          </text>
          <text x={width - PAD.right} y={height - 6} textAnchor="end" className="fill-muted text-[11px]">
            {formatDate(scale.t1)}
          </text>

          {visible.map((s) => (
            <g key={s.id}>
              <path d={path(s.points)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" />
              {s.points.length === 1 ? (
                <circle cx={scale.x(s.points[0].t)} cy={scale.y(s.points[0].v)} r={4} fill={s.color} />
              ) : null}
            </g>
          ))}

          {snapped !== undefined ? (
            <g>
              <line
                x1={scale.x(snapped)}
                x2={scale.x(snapped)}
                y1={PAD.top}
                y2={height - PAD.bottom}
                className="stroke-muted"
                strokeDasharray="3 3"
              />
              {visible.map((s) => {
                const p = at(s, snapped);
                return <circle key={s.id} cx={scale.x(snapped)} cy={scale.y(p.v)} r={4} fill={s.color} className="stroke-background" strokeWidth={2} />;
              })}
            </g>
          ) : null}
        </svg>

        {snapped !== undefined ? (
          <div
            className="pointer-events-none absolute top-0 z-10 rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs shadow-sm"
            style={{
              left: Math.min(scale.x(snapped) + 10, width - 170),
            }}
          >
            <div className="font-medium">{formatDate(snapped)}</div>
            {visible.map((s) => (
              <div key={s.id} className="flex items-center gap-2 tabular-nums">
                <span className="size-2 rounded-full" style={{ background: s.color }} />
                <span className="text-muted">{s.label}</span>
                <span className="ml-auto pl-2 font-medium">{formatValue(at(s, snapped).v)}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </figure>
  );
}
