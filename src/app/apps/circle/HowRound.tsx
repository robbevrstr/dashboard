"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { tellSaucer } from "@/lib/saucer";
import { isScore, loadSetting, saveSetting } from "@/lib/store";

type Pt = { x: number; y: number };
type Fit = { cx: number; cy: number; r: number };
type Result =
  | { ok: true; score: number; fit: Fit; worst: string }
  | { ok: false; message: string };

const BEST_KEY = "how-round-best";
const GOOD = "#10b981"; // emerald-500
const OKAY = "#f59e0b"; // amber-500
const BAD = "#f43f5e"; // rose-500

/** Least-squares circle through the points (the Kåsa fit): solve x² + y² + ax + by + c = 0. */
function fitCircle(pts: Pt[]): Fit | undefined {
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sz = 0, sxz = 0, syz = 0;
  for (const { x, y } of pts) {
    const z = x * x + y * y;
    sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sz += z; sxz += x * z; syz += y * z;
  }
  const n = pts.length;
  // Normal equations: [sxx sxy sx; sxy syy sy; sx sy n] · [a b c] = −[sxz syz sz]
  const m = [
    [sxx, sxy, sx, -sxz],
    [sxy, syy, sy, -syz],
    [sx, sy, n, -sz],
  ];
  for (let i = 0; i < 3; i++) {
    let p = i;
    for (let k = i + 1; k < 3; k++) if (Math.abs(m[k][i]) > Math.abs(m[p][i])) p = k;
    [m[i], m[p]] = [m[p], m[i]];
    if (Math.abs(m[i][i]) < 1e-9) return undefined;
    for (let k = 0; k < 3; k++) {
      if (k === i) continue;
      const f = m[k][i] / m[i][i];
      for (let j = i; j < 4; j++) m[k][j] -= f * m[i][j];
    }
  }
  const [a, b, c] = [m[0][3] / m[0][0], m[1][3] / m[1][1], m[2][3] / m[2][2]];
  const cx = -a / 2;
  const cy = -b / 2;
  const r2 = cx * cx + cy * cy - c;
  return r2 > 0 ? { cx, cy, r: Math.sqrt(r2) } : undefined;
}

/** How far the stroke goes round the centre, in turns. */
function turns(pts: Pt[], { cx, cy }: Fit) {
  let sum = 0;
  for (let i = 1; i < pts.length; i++) {
    let d = Math.atan2(pts[i].y - cy, pts[i].x - cx) - Math.atan2(pts[i - 1].y - cy, pts[i - 1].x - cx);
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    sum += d;
  }
  return Math.abs(sum) / (2 * Math.PI);
}

const DIRECTIONS = ["right", "top right", "top", "top left", "left", "bottom left", "bottom", "bottom right"];

function judge(pts: Pt[], final: boolean): Result | undefined {
  if (pts.length < 12) return undefined;
  const fit = fitCircle(pts);
  if (!fit) return final ? { ok: false, message: "That's a line, not a circle." } : undefined;
  if (final && fit.r < 40) return { ok: false, message: "Bigger, please." };
  const t = turns(pts, fit);
  if (final && t < 0.85) return { ok: false, message: "Go all the way round." };
  if (final && t > 1.3) return { ok: false, message: "Just one lap, please." };
  let sq = 0;
  let worstErr = 0;
  let worstPt = pts[0];
  for (const p of pts) {
    const e = Math.hypot(p.x - fit.cx, p.y - fit.cy) - fit.r;
    sq += e * e;
    if (Math.abs(e) > worstErr) {
      worstErr = Math.abs(e);
      worstPt = p;
    }
  }
  const rel = Math.sqrt(sq / pts.length) / fit.r;
  const score = Math.max(0, Math.round((1 - rel * 3.5) * 1000) / 10);
  const angle = Math.atan2(-(worstPt.y - fit.cy), worstPt.x - fit.cx);
  const worst = DIRECTIONS[(Math.round(angle / (Math.PI / 4)) + 8) % 8];
  return { ok: true, score, fit, worst };
}

function comment(score: number) {
  if (score >= 97) return "Are you a compass?";
  if (score >= 93) return "Beautifully round.";
  if (score >= 88) return "Very nice circle.";
  if (score >= 80) return "Pretty round.";
  if (score >= 65) return "Round-ish.";
  return "More of a potato.";
}

export function HowRound() {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const pts = useRef<Pt[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [drawing, setDrawing] = useState(false);
  const isDrawing = useRef(false);
  const [live, setLive] = useState<number>();
  const [result, setResult] = useState<Result>();
  const [best, setBest] = useState<number>();

  useEffect(() => {
    let live = true;
    loadSetting(BEST_KEY, isScore).then((b) => {
      if (live && b) setBest((cur) => Math.max(cur ?? 0, b));
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = (w: number) => setSize({ w, h: Math.min(Math.round(w * 0.85), 440) });
    measure(el.clientWidth);
    const ro = new ResizeObserver(([e]) => measure(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const draw = useCallback(
    (final?: Result) => {
      const c = canvas.current;
      const ctx = c?.getContext("2d");
      if (!c || !ctx) return;
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size.w, size.h);
      const style = getComputedStyle(document.documentElement);
      const muted = style.getPropertyValue("--muted").trim() || "#78716c";
      const fg = style.getPropertyValue("--foreground").trim() || "#1c1917";
      const p = pts.current;

      if (!p.length) {
        ctx.fillStyle = muted;
        ctx.beginPath();
        ctx.arc(size.w / 2, size.h / 2, 3, 0, Math.PI * 2);
        ctx.fill();
        return;
      }

      const fit = final?.ok ? final.fit : p.length >= 12 ? fitCircle(p) : undefined;
      if (final?.ok) {
        ctx.setLineDash([4, 6]);
        ctx.strokeStyle = muted;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(final.fit.cx, final.fit.cy, final.fit.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = muted;
        ctx.beginPath();
        ctx.arc(final.fit.cx, final.fit.cy, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      for (let i = 1; i < p.length; i++) {
        let colour = fg;
        if (fit) {
          const e = Math.abs(Math.hypot(p[i].x - fit.cx, p[i].y - fit.cy) - fit.r) / fit.r;
          colour = e < 0.025 ? GOOD : e < 0.06 ? OKAY : BAD;
        }
        ctx.strokeStyle = colour;
        ctx.beginPath();
        ctx.moveTo(p[i - 1].x, p[i - 1].y);
        ctx.lineTo(p[i].x, p[i].y);
        ctx.stroke();
      }
    },
    [size],
  );

  // Redraw when the size or the theme changes.
  useEffect(() => {
    draw(result);
    const mo = new MutationObserver(() => draw(result));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, [draw, result]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>): Pt => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const finish = () => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    setDrawing(false);
    const res = judge(pts.current, true) ?? { ok: false, message: "Draw a circle, not a dot." };
    setResult(res);
    setLive(undefined);
    if (!res.ok) return;
    const record = best === undefined || res.score > best;
    if (record) {
      setBest(res.score);
      saveSetting(BEST_KEY, res.score);
    }
    tellSaucer({
      kind: "score",
      game: "circle",
      mood: record && best !== undefined ? "best" : res.score >= 88 ? "good" : res.score < 65 ? "bad" : "okay",
    });
  };

  return (
    <div className="mt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm text-muted">
        <p>Draw one circle around the dot, in one go.</p>
        <p>Best: {best !== undefined ? `${best}%` : "–"}</p>
      </div>
      <div ref={wrap} className="relative mt-4 overflow-hidden panel">
        <canvas
          ref={canvas}
          width={Math.round(size.w * (typeof window === "undefined" ? 1 : window.devicePixelRatio || 1))}
          height={Math.round(size.h * (typeof window === "undefined" ? 1 : window.devicePixelRatio || 1))}
          style={{ width: size.w, height: size.h }}
          className="block cursor-crosshair touch-none"
          aria-label="Drawing area: draw a circle with your mouse or finger"
          onPointerDown={(e) => {
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {}
            pts.current = [point(e)];
            isDrawing.current = true;
            setResult(undefined);
            setDrawing(true);
          }}
          onPointerMove={(e) => {
            if (!isDrawing.current) return;
            const p = point(e);
            const prev = pts.current.at(-1)!;
            if (Math.hypot(p.x - prev.x, p.y - prev.y) < 2) return;
            pts.current.push(p);
            const j = judge(pts.current, false);
            setLive(j?.ok ? j.score : undefined);
            draw();
          }}
          onPointerUp={finish}
          onPointerCancel={finish}
        />
      </div>
      <div className="mt-5 min-h-24 text-center" aria-live="polite">
        {drawing && live !== undefined ? (
          <p className="text-4xl font-semibold tracking-tight tabular-nums opacity-80">{live.toFixed(1)}%</p>
        ) : result?.ok ? (
          <>
            <p className="text-5xl font-semibold tracking-tight tabular-nums sm:text-6xl">{result.score.toFixed(1)}%</p>
            <p className="mt-1 text-muted">
              {comment(result.score)} {result.score < 97 ? `Wobbliest at the ${result.worst}.` : ""}
              {best === result.score ? " New best!" : ""}
            </p>
          </>
        ) : result ? (
          <p className="text-xl font-medium">{result.message}</p>
        ) : null}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
        <li className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-emerald-500" aria-hidden /> Within 2.5% of round
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-amber-500" aria-hidden /> Within 6%
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-rose-500" aria-hidden /> Off
        </li>
        <li>Dashed: the closest perfect circle</li>
      </ul>
    </div>
  );
}
