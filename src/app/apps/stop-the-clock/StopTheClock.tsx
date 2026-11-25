"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { tellSaucer } from "@/lib/saucer";
import { loadSetting, saveSetting } from "@/lib/store";

const TARGET = 10;
const MODES = {
  normal: { label: "Normal", hideAfter: 5, hint: "The timer disappears after 5 seconds." },
  blind: { label: "Blind", hideAfter: 1, hint: "The timer disappears after 1 second." },
} as const;
type Mode = keyof typeof MODES;
type Phase = "idle" | "running" | "done";

const BEST_KEY = "stop-the-clock-best";

function verdict(diff: number) {
  const d = Math.abs(diff);
  if (d < 0.02) return "Perfect. Are you a metronome?";
  if (d < 0.1) return "Excellent.";
  if (d < 0.3) return "Good.";
  if (d < 0.7) return "Close-ish.";
  if (d < 2) return "Not quite.";
  return "Were you even counting?";
}

const fmt = (s: number) => s.toFixed(2);
const signed = (s: number) => `${s >= 0 ? "+" : "−"}${Math.abs(s).toFixed(2)} s`;

export function StopTheClock() {
  const [mode, setMode] = useState<Mode>("normal");
  const [phase, setPhase] = useState<Phase>("idle");
  const [shown, setShown] = useState(0);
  const [result, setResult] = useState<number>();
  const [history, setHistory] = useState<number[]>([]);
  const [best, setBest] = useState<Partial<Record<Mode, number>>>({});
  const start = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    let live = true;
    loadSetting(BEST_KEY, (b): b is Partial<Record<Mode, number>> => !!b && typeof b === "object").then((b) => {
      // A score set while loading wins over the stored one.
      if (live && b) setBest((cur) => ({ ...b, ...cur }));
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => () => clearInterval(timer.current), []);

  const press = useCallback(() => {
    if (phase === "running") {
      clearInterval(timer.current);
      const elapsed = (performance.now() - start.current) / 1000;
      const diff = elapsed - TARGET;
      setResult(elapsed);
      setShown(elapsed);
      setPhase("done");
      setHistory((h) => [diff, ...h].slice(0, 10));
      const prev = best[mode];
      const record = prev === undefined || Math.abs(diff) < Math.abs(prev);
      if (record) {
        const next = { ...best, [mode]: diff };
        setBest(next);
        saveSetting(BEST_KEY, next);
      }
      tellSaucer({
        kind: "score",
        game: "clock",
        mood: record && prev !== undefined ? "best" : Math.abs(diff) < 0.1 ? "good" : Math.abs(diff) >= 0.7 ? "bad" : "okay",
      });
      return;
    }
    start.current = performance.now();
    setResult(undefined);
    setShown(0);
    setPhase("running");
    // An interval rather than animation frames, so the timer keeps going even when frames are throttled.
    timer.current = setInterval(() => setShown((performance.now() - start.current) / 1000), 16);
  }, [phase, mode, best]);

  // Space bar anywhere on the page, except where it already means something.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== " " || e.repeat) return;
      const el = e.target as HTMLElement;
      if (el.closest("button, input, select, textarea, a")) return;
      e.preventDefault();
      press();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press]);

  const hidden = phase === "running" && shown >= MODES[mode].hideAfter;
  const diff = result !== undefined ? result - TARGET : undefined;
  const tendency = history.length >= 3 ? history.reduce((a, b) => a + b, 0) / history.length : undefined;

  return (
    <div className="mt-10">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <div className="flex rounded-lg border border-line p-0.5" role="group" aria-label="Difficulty">
          {(Object.keys(MODES) as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              disabled={phase === "running"}
              aria-pressed={mode === m}
              onClick={() => {
                setMode(m);
                setHistory([]);
                setPhase("idle");
                setResult(undefined);
                setShown(0);
              }}
              className={`rounded-md px-3 py-1 outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 ${
                mode === m ? "bg-foreground text-background" : "text-muted hover:text-foreground"
              }`}
            >
              {MODES[m].label}
            </button>
          ))}
        </div>
        <p className="text-muted">{MODES[mode].hint}</p>
      </div>

      <div className="mt-8 panel px-4 py-10 text-center sm:py-14">
        <p
          className={`font-mono text-7xl font-semibold tracking-tight tabular-nums transition-[filter,opacity] duration-300 sm:text-9xl ${
            hidden ? "opacity-20 blur-md" : ""
          } ${phase === "done" && diff !== undefined ? (Math.abs(diff) < 0.1 ? "text-emerald-600 dark:text-emerald-400" : Math.abs(diff) < 0.7 ? "text-amber-600 dark:text-amber-400" : "text-rose-600 dark:text-rose-400") : ""}`}
          aria-hidden={hidden}
        >
          {hidden ? "?.??" : fmt(shown)}
        </p>
        <p className="mt-3 text-sm text-muted" aria-live="polite">
          {phase === "idle"
            ? `Stop the clock at exactly ${TARGET}.00 seconds.`
            : phase === "running"
              ? hidden
                ? "Keep counting in your head…"
                : "Counting…"
              : diff !== undefined
                ? `${signed(diff)}. ${verdict(diff)}`
                : ""}
        </p>
        <button
          type="button"
          onClick={press}
          className={`mt-8 w-full max-w-xs rounded-md px-6 py-4 text-lg font-semibold outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
            phase === "running" ? "bg-rose-500 text-white hover:bg-rose-600" : "bg-accent text-background hover:opacity-90"
          }`}
        >
          {phase === "running" ? "Stop" : phase === "done" ? "Try again" : "Start"}
        </button>
        <p className="mt-3 text-xs text-muted">or press the space bar</p>
      </div>

      <div className="mt-8 grid gap-8 sm:grid-cols-2">
        <section aria-labelledby="best">
          <h2 id="best" className="font-medium">
            Your best
          </h2>
          <dl className="mt-3 space-y-1.5 text-sm">
            {(Object.keys(MODES) as Mode[]).map((m) => (
              <div key={m} className="flex justify-between gap-4 border-b border-line pb-1.5">
                <dt className="text-muted">{MODES[m].label}</dt>
                <dd className="font-mono tabular-nums">{best[m] !== undefined ? signed(best[m]!) : "–"}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section aria-labelledby="tries">
          <h2 id="tries" className="font-medium">
            This session
          </h2>
          {history.length ? (
            <>
              <ol className="mt-3 flex flex-wrap gap-1.5">
                {history.map((d, i) => (
                  <li
                    key={history.length - i}
                    className={`rounded-md px-2 py-1 font-mono text-xs tabular-nums ${
                      Math.abs(d) < 0.1
                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                        : Math.abs(d) < 0.7
                          ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                          : "bg-rose-500/15 text-rose-700 dark:text-rose-300"
                    }`}
                  >
                    {signed(d)}
                  </li>
                ))}
              </ol>
              {tendency !== undefined ? (
                <p className="mt-3 text-sm text-muted">
                  {Math.abs(tendency) < 0.05
                    ? "No clear pattern: your inner clock is well tuned."
                    : `On average you stop ${Math.abs(tendency).toFixed(2)} s ${tendency < 0 ? "early: your inner clock runs fast" : "late: your inner clock runs slow"}.`}
                </p>
              ) : null}
            </>
          ) : (
            <p className="mt-3 text-sm text-muted">Your tries show up here.</p>
          )}
        </section>
      </div>
    </div>
  );
}
