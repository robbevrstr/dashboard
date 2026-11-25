"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isScore, loadSetting, saveSetting } from "@/lib/store";

// A secret: click Zorp five times quickly and you get to fly the saucer through an asteroid field.

type Rock = { x: number; y: number; r: number; vx: number; vy: number; rot: number; vr: number; shape: number[] };
type Star = { x: number; y: number; z: number };
type Spark = { x: number; y: number; vx: number; vy: number; life: number };
type Phase = "ready" | "flying" | "over";

const BEST_KEY = "saucer-game-best";
const SPACE = "#05060f";
const KM_PER_S = 1000;

const km = (n: number) => `${Math.round(n).toLocaleString("en-GB")} km`;

export function SaucerGame({ onClose }: { onClose: (distance: number) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("ready");
  const [distance, setDistance] = useState(0);
  const [best, setBest] = useState(0);
  const [newBest, setNewBest] = useState(false);
  const phaseRef = useRef<Phase>("ready");
  const lastDistance = useRef(0);
  const bestRef = useRef(0);
  const keys = useRef({ left: false, right: false });
  const pointerX = useRef<number>(undefined);
  const world = useRef({
    t: 0,
    x: 0,
    rocks: [] as Rock[],
    stars: [] as Star[],
    sparks: [] as Spark[],
    spawnIn: 1,
  });

  useEffect(() => {
    loadSetting(BEST_KEY, isScore).then((b) => {
      if (b && b > bestRef.current) {
        bestRef.current = b;
        setBest(b);
      }
    });
    const before = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      before?.focus?.();
    };
  }, []);

  const start = useCallback(() => {
    const c = canvas.current;
    if (!c) return;
    const w = world.current;
    w.t = 0;
    w.x = c.clientWidth / 2;
    w.rocks = [];
    w.sparks = [];
    w.spawnIn = 0.8;
    pointerX.current = undefined;
    phaseRef.current = "flying";
    setPhase("flying");
    setNewBest(false);
  }, []);

  const crash = useCallback(() => {
    const w = world.current;
    const d = w.t * KM_PER_S;
    phaseRef.current = "over";
    lastDistance.current = Math.max(lastDistance.current, d);
    setPhase("over");
    setDistance(d);
    if (d > bestRef.current) {
      bestRef.current = d;
      setBest(d);
      setNewBest(true);
      saveSetting(BEST_KEY, Math.round(d));
    }
  }, []);

  // Report the furthest flight of this visit, including one still in progress.
  const close = useCallback(() => {
    const now = phaseRef.current === "flying" ? world.current.t * KM_PER_S : 0;
    onClose(Math.max(lastDistance.current, now));
  }, [onClose]);

  // Keyboard: arrows or A/D to steer, space or enter to launch, escape to leave.
  useEffect(() => {
    const set = (e: KeyboardEvent, down: boolean) => {
      const k = e.key.toLowerCase();
      if (k === "arrowleft" || k === "a") keys.current.left = down;
      else if (k === "arrowright" || k === "d") keys.current.right = down;
      else return false;
      return true;
    };
    const onDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (set(e, true)) {
        e.preventDefault();
        return;
      }
      if ((e.key === " " || e.key === "Enter") && phaseRef.current !== "flying") {
        if ((e.target as HTMLElement).closest("button")) return;
        e.preventDefault();
        start();
      }
    };
    const onUp = (e: KeyboardEvent) => {
      set(e, false);
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [start, close]);

  // The game loop.
  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#38bdf8";
    const w = world.current;
    let width = 0;
    let height = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      width = c.clientWidth;
      height = c.clientHeight;
      c.width = Math.round(width * dpr);
      c.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!w.x) w.x = width / 2;
      if (!w.stars.length) {
        w.stars = Array.from({ length: 140 }, () => ({ x: Math.random() * width, y: Math.random() * height, z: Math.random() }));
      }
    };
    resize();
    window.addEventListener("resize", resize);

    const shipY = () => height - Math.min(110, height * 0.18);

    const spawn = () => {
      const r = 14 + Math.random() * (22 + Math.min(w.t, 60) * 0.4);
      const n = 9;
      w.rocks.push({
        x: Math.random() * width,
        y: -r - 10,
        r,
        vx: (Math.random() - 0.5) * 60,
        vy: 140 + Math.min(w.t, 90) * 7 + Math.random() * 90,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 2,
        shape: Array.from({ length: n }, () => 0.75 + Math.random() * 0.35),
      });
    };

    const drawShip = (x: number, y: number, tilt: number, t: number) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(tilt);
      // Jet flames
      const flame = 10 + Math.sin(t * 40) * 3 + Math.random() * 3;
      ctx.fillStyle = "#f59e0b";
      for (const jx of [-16, 16]) {
        ctx.beginPath();
        ctx.moveTo(jx - 4, 10);
        ctx.lineTo(jx, 10 + flame);
        ctx.lineTo(jx + 4, 10);
        ctx.fill();
      }
      ctx.fillStyle = "#44403c";
      ctx.fillRect(-21, 6, 10, 5);
      ctx.fillRect(11, 6, 10, 5);
      // Dome and pilot
      ctx.beginPath();
      ctx.arc(0, -4, 14, Math.PI, 0);
      ctx.fillStyle = "rgba(186, 230, 253, 0.25)";
      ctx.fill();
      ctx.strokeStyle = "#e7e5e4";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -4, 10, Math.PI, 0);
      ctx.fillStyle = "#1c1917";
      ctx.fill();
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(-3.5, -9, 2, 0, Math.PI * 2);
      ctx.arc(3.5, -9, 2, 0, Math.PI * 2);
      ctx.fill();
      // Rim and lights
      ctx.beginPath();
      ctx.ellipse(0, 0, 30, 9, 0, 0, Math.PI * 2);
      ctx.fillStyle = "#d6d3d1";
      ctx.fill();
      ctx.strokeStyle = "#78716c";
      ctx.stroke();
      ctx.fillStyle = "#fbbf24";
      for (let i = 0; i < 3; i++) {
        if (Math.floor(t * 6) % 3 !== i) ctx.globalAlpha = 0.45;
        ctx.beginPath();
        ctx.arc((i - 1) * 15, i === 1 ? 4 : 2, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    };

    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const flying = phaseRef.current === "flying";
      const sy = shipY();

      // Update
      const speed = flying ? 1 + Math.min(w.t, 90) / 30 : 0.35;
      for (const s of w.stars) {
        s.y += (20 + s.z * 120) * speed * dt;
        if (s.y > height) {
          s.y = -2;
          s.x = Math.random() * width;
        }
      }
      let tilt = 0;
      if (flying) {
        w.t += dt;
        const before = w.x;
        const step = 460 * dt;
        if (keys.current.left) w.x -= step;
        if (keys.current.right) w.x += step;
        if (pointerX.current !== undefined && !keys.current.left && !keys.current.right) {
          w.x += (pointerX.current - w.x) * Math.min(1, dt * 10);
        }
        w.x = Math.max(32, Math.min(width - 32, w.x));
        tilt = Math.max(-0.35, Math.min(0.35, (w.x - before) / (dt * 2000 || 1)));
        w.spawnIn -= dt;
        if (w.spawnIn <= 0) {
          spawn();
          w.spawnIn = Math.max(0.16, 0.75 - w.t * 0.012) * (0.6 + Math.random() * 0.8);
        }
      }
      for (const r of w.rocks) {
        r.x += r.vx * dt;
        r.y += r.vy * dt;
        r.rot += r.vr * dt;
      }
      w.rocks = w.rocks.filter((r) => r.y < height + r.r + 20);
      for (const p of w.sparks) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
      }
      w.sparks = w.sparks.filter((p) => p.life > 0);

      // Collisions: the saucer counts as two circles, the dome and the middle of the rim. A little forgiving.
      if (flying) {
        for (const r of w.rocks) {
          const hit =
            Math.hypot(r.x - w.x, r.y - sy) < r.r * 0.85 + 22 ||
            Math.hypot(r.x - w.x, r.y - (sy - 8)) < r.r * 0.85 + 11;
          if (hit) {
            for (let i = 0; i < 40; i++) {
              const a = Math.random() * Math.PI * 2;
              const v = 60 + Math.random() * 260;
              w.sparks.push({ x: w.x, y: sy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5 + Math.random() * 0.7 });
            }
            crash();
            break;
          }
        }
      }

      // Draw
      ctx.fillStyle = SPACE;
      ctx.fillRect(0, 0, width, height);
      for (const s of w.stars) {
        ctx.globalAlpha = 0.3 + s.z * 0.7;
        ctx.fillStyle = "#e0e7ff";
        const size = 0.6 + s.z * 1.4;
        ctx.fillRect(s.x, s.y, size, size * (flying ? 1 + s.z * 3 : 1));
      }
      ctx.globalAlpha = 1;
      for (const r of w.rocks) {
        ctx.save();
        ctx.translate(r.x, r.y);
        ctx.rotate(r.rot);
        ctx.beginPath();
        r.shape.forEach((f, i) => {
          const a = (i / r.shape.length) * Math.PI * 2;
          const px = Math.cos(a) * r.r * f;
          const py = Math.sin(a) * r.r * f;
          if (i) ctx.lineTo(px, py);
          else ctx.moveTo(px, py);
        });
        ctx.closePath();
        ctx.fillStyle = "#3f3a36";
        ctx.fill();
        ctx.strokeStyle = "#a8a29e";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = "rgba(0,0,0,.3)";
        ctx.beginPath();
        ctx.arc(r.r * 0.25, -r.r * 0.2, r.r * 0.22, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      if (phaseRef.current !== "over") drawShip(w.x, sy, tilt, now / 1000);
      for (const p of w.sparks) {
        ctx.globalAlpha = Math.min(1, p.life * 2);
        ctx.fillStyle = Math.random() < 0.5 ? "#fbbf24" : "#f97316";
        ctx.fillRect(p.x, p.y, 3, 3);
      }
      ctx.globalAlpha = 1;
      if (flying) {
        ctx.fillStyle = "#e0e7ff";
        ctx.font = "600 16px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.textAlign = "left";
        ctx.fillText(km(w.t * KM_PER_S), 20, 34);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [crash]);

  const onPointer = (e: React.PointerEvent) => {
    if (phaseRef.current === "flying") pointerX.current = e.clientX;
  };

  return (
    <div
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-label="Asteroid field: a secret saucer game"
      tabIndex={-1}
      className="fixed inset-0 z-50 touch-none select-none outline-none"
      style={{ background: SPACE }}
    >
      <canvas ref={canvas} className="block size-full" onPointerMove={onPointer} onPointerDown={onPointer} />
      <button
        type="button"
        onClick={close}
        className="absolute top-4 right-4 rounded-lg border border-white/20 px-3 py-1.5 text-sm text-indigo-100 outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-sky-400"
      >
        Back to the site <span className="text-indigo-300/70">(Esc)</span>
      </button>
      {phase !== "flying" ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
          <div className="pointer-events-auto max-w-sm rounded-2xl border border-white/15 bg-[#0b0d1f]/90 p-6 text-center text-indigo-50 shadow-2xl">
            {phase === "ready" ? (
              <>
                <h2 className="text-2xl font-semibold tracking-tight">Asteroid field ahead</h2>
                <p className="mt-3 text-sm leading-relaxed text-indigo-200/80">
                  You found the secret. Fly Zorp as far as you can without hitting a rock. Steer with the arrow keys, or
                  move your mouse or finger.
                </p>
              </>
            ) : (
              <>
                <h2 className="text-2xl font-semibold tracking-tight">Crunch.</h2>
                <p className="mt-3 text-3xl font-semibold tabular-nums">{km(distance)}</p>
                <p className="mt-1 text-sm text-indigo-200/80">
                  {newBest ? "A new best!" : best ? `Your best: ${km(best)}` : ""}
                </p>
              </>
            )}
            <button
              type="button"
              onClick={start}
              className="mt-5 w-full rounded-xl bg-indigo-100 px-5 py-3 font-semibold text-[#0b0d1f] outline-none hover:bg-white focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0d1f]"
            >
              {phase === "ready" ? "Launch" : "Fly again"}
            </button>
            <p className="mt-2 text-xs text-indigo-200/60">or press the space bar</p>
            {phase === "ready" && best ? <p className="mt-3 text-xs text-indigo-200/60">Your best: {km(best)}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
