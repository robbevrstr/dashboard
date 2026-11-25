"use client";

import { useEffect, useState } from "react";
import { tellSaucer } from "@/lib/saucer";
import { isScore, loadSetting, saveSetting } from "@/lib/store";

type HSL = { h: number; s: number; l: number };
type Round = { target: HSL; guess: HSL; score: number };
type Phase = "ready" | "show" | "guess" | "reveal" | "end";

const ROUNDS = 5;
const SHOW_MS = 2000;
const BEST_KEY = "colour-memory-best";

const css = ({ h, s, l }: HSL) => `hsl(${h} ${s}% ${l}%)`;
const rand = (min: number, max: number) => Math.round(min + Math.random() * (max - min));
// Not too grey, not too close to black or white: those are no fun to remember.
const randomColour = (): HSL => ({ h: rand(0, 359), s: rand(30, 95), l: rand(25, 78) });

// HSL → sRGB → CIELAB, then the CIE76 colour difference (ΔE). A ΔE around 2 is
// barely visible; above 50 the colours have little to do with each other.
function toLab({ h, s, l }: HSL) {
  const S = s / 100;
  const L = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = S * Math.min(L, 1 - L);
  const f = (n: number) => L - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = [f(0), f(8), f(4)].map(lin);
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const t = (v: number) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
  return { L: 116 * t(y) - 16, A: 500 * (t(x) - t(y)), B: 200 * (t(y) - t(z)) };
}
function deltaE(p: HSL, q: HSL) {
  const a = toLab(p);
  const b = toLab(q);
  return Math.hypot(a.L - b.L, a.A - b.A, a.B - b.B);
}
const scoreFor = (target: HSL, guess: HSL) => Math.round(Math.max(0, 1 - deltaE(target, guess) / 60) * 100) / 10;

function comment(score: number) {
  if (score >= 9.5) return "Spot on.";
  if (score >= 8.5) return "Very close.";
  if (score >= 7) return "Pretty good.";
  if (score >= 5) return "In the neighbourhood.";
  return "Different colour, same planet.";
}

export function ColourMemory() {
  const [phase, setPhase] = useState<Phase>("ready");
  const [target, setTarget] = useState<HSL>({ h: 200, s: 60, l: 50 });
  const [guess, setGuess] = useState<HSL>({ h: 180, s: 50, l: 50 });
  const [rounds, setRounds] = useState<Round[]>([]);
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
    if (phase !== "show") return;
    const id = setTimeout(() => setPhase("guess"), SHOW_MS);
    return () => clearTimeout(id);
  }, [phase, target]);

  const startRound = () => {
    setTarget(randomColour());
    setGuess({ h: rand(0, 359), s: 50, l: 50 });
    setPhase("show");
  };

  const newGame = () => {
    setRounds([]);
    startRound();
  };

  const submit = () => {
    const score = scoreFor(target, guess);
    const next = [...rounds, { target, guess, score }];
    setRounds(next);
    setPhase("reveal");
    if (next.length === ROUNDS) {
      const total = Math.round(next.reduce((a, r) => a + r.score, 0) * 10) / 10;
      const record = best === undefined || total > best;
      if (record) {
        setBest(total);
        saveSetting(BEST_KEY, total);
      }
      tellSaucer({
        kind: "score",
        game: "colour",
        mood: record && best !== undefined ? "best" : total >= 35 ? "good" : total < 25 ? "bad" : "okay",
      });
    }
  };

  const total = Math.round(rounds.reduce((a, r) => a + r.score, 0) * 10) / 10;
  const last = rounds.at(-1);
  const roundNo = phase === "reveal" || phase === "end" ? rounds.length : rounds.length + 1;

  return (
    <div className="mt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm text-muted">
        <p>
          {phase === "ready" ? `${ROUNDS} rounds, up to 10 points each.` : `Round ${Math.min(roundNo, ROUNDS)} of ${ROUNDS}`}
          {rounds.length ? ` · ${total} points` : ""}
        </p>
        <p>Best: {best !== undefined ? `${best} / ${ROUNDS * 10}` : "–"}</p>
      </div>

      <div className="mt-4 grid gap-6 md:grid-cols-[1fr_20rem]">
        <div
          className="relative flex aspect-[4/3] items-center justify-center overflow-hidden panel md:aspect-auto md:min-h-96"
          style={{ background: phase === "show" ? css(target) : phase === "guess" ? css(guess) : undefined }}
        >
          {phase === "ready" ? (
            <div className="max-w-xs px-6 text-center">
              <p className="text-lg">A colour appears for two seconds. Then rebuild it from memory.</p>
              <button
                type="button"
                onClick={newGame}
                className="mt-6 rounded-md bg-accent px-6 py-3 font-semibold text-background outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent"
              >
                Start
              </button>
            </div>
          ) : null}
          {phase === "show" ? (
            <>
              <span className="sr-only" aria-live="polite">
                Remember this colour.
              </span>
              <span
                key={rounds.length}
                className="absolute inset-x-0 bottom-0 h-1.5 origin-left bg-white/70 animate-[shrink_2s_linear_forwards] motion-reduce:animate-none"
                aria-hidden
              />
            </>
          ) : null}
          {phase === "reveal" && last ? (
            <div className="absolute inset-0 grid grid-cols-2">
              <div className="flex items-end p-4" style={{ background: css(last.target) }}>
                <span className="rounded-md bg-black/45 px-2 py-1 text-xs text-white">The colour</span>
              </div>
              <div className="flex items-end justify-end p-4" style={{ background: css(last.guess) }}>
                <span className="rounded-md bg-black/45 px-2 py-1 text-xs text-white">Yours</span>
              </div>
            </div>
          ) : null}
          {phase === "end" ? (
            <div className="w-full p-6">
              <p className="text-center text-sm text-muted">Final score</p>
              <p className="text-center text-6xl font-semibold tracking-tight tabular-nums">
                {total}
                <span className="text-2xl font-normal text-muted"> / {ROUNDS * 10}</span>
              </p>
              <ul className="mx-auto mt-6 grid max-w-sm gap-2">
                {rounds.map((r, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm">
                    <span className="flex h-8 flex-1 overflow-hidden rounded-md">
                      <span className="flex-1" style={{ background: css(r.target) }} />
                      <span className="flex-1" style={{ background: css(r.guess) }} />
                    </span>
                    <span className="w-10 text-right tabular-nums">{r.score}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col justify-between gap-6 panel p-5">
          {phase === "guess" ? (
            <>
              <div className="space-y-5">
                <Slider
                  label="Hue"
                  value={guess.h}
                  max={359}
                  onChange={(h) => setGuess((g) => ({ ...g, h }))}
                  track={`linear-gradient(to right, ${[0, 60, 120, 180, 240, 300, 360].map((h) => `hsl(${h} ${guess.s}% ${guess.l}%)`).join(",")})`}
                />
                <Slider
                  label="Saturation"
                  value={guess.s}
                  max={100}
                  onChange={(s) => setGuess((g) => ({ ...g, s }))}
                  track={`linear-gradient(to right, hsl(${guess.h} 0% ${guess.l}%), hsl(${guess.h} 100% ${guess.l}%))`}
                />
                <Slider
                  label="Lightness"
                  value={guess.l}
                  max={100}
                  onChange={(l) => setGuess((g) => ({ ...g, l }))}
                  track={`linear-gradient(to right, #000, hsl(${guess.h} ${guess.s}% 50%), #fff)`}
                />
              </div>
              <button
                type="button"
                onClick={submit}
                className="rounded-md bg-accent px-6 py-3 font-semibold text-background outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent"
              >
                That&apos;s the one
              </button>
            </>
          ) : phase === "reveal" && last ? (
            <>
              <div aria-live="polite">
                <p className="text-5xl font-semibold tracking-tight tabular-nums">
                  {last.score}
                  <span className="text-xl font-normal text-muted"> / 10</span>
                </p>
                <p className="mt-2">{comment(last.score)}</p>
                <dl className="mt-4 space-y-1 font-mono text-xs text-muted">
                  <div className="flex justify-between">
                    <dt>Colour</dt>
                    <dd>
                      {last.target.h}° {last.target.s}% {last.target.l}%
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Yours</dt>
                    <dd>
                      {last.guess.h}° {last.guess.s}% {last.guess.l}%
                    </dd>
                  </div>
                </dl>
              </div>
              <button
                type="button"
                onClick={() => (rounds.length >= ROUNDS ? setPhase("end") : startRound())}
                className="rounded-md bg-accent px-6 py-3 font-semibold text-background outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent"
              >
                {rounds.length >= ROUNDS ? "See the result" : "Next colour"}
              </button>
            </>
          ) : phase === "end" ? (
            <>
              <p className="text-lg">
                {total >= 45 ? "Your eyes are a colour picker." : total >= 35 ? "A good eye for colour." : total >= 25 ? "Not bad at all." : "Colours are hard. Try again?"}
              </p>
              <button
                type="button"
                onClick={newGame}
                className="rounded-md bg-accent px-6 py-3 font-semibold text-background outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent"
              >
                Play again
              </button>
            </>
          ) : (
            <p className="text-sm text-muted">
              {phase === "show" ? "Look closely…" : "The sliders show up once the colour is gone: hue, saturation and lightness."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Slider({
  label,
  value,
  max,
  onChange,
  track,
}: {
  label: string;
  value: number;
  max: number;
  onChange: (v: number) => void;
  track: string;
}) {
  const id = `slider-${label.toLowerCase()}`;
  return (
    <div>
      <label htmlFor={id} className="text-sm text-muted">
        {label}
      </label>
      <input
        id={id}
        type="range"
        min={0}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="colour-slider mt-2 w-full"
        style={{ background: track }}
      />
    </div>
  );
}
