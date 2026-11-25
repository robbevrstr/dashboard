"use client";

import { useEffect, useRef, useState } from "react";
import type { PowerData } from "@/lib/power";
import type { PowerMix } from "@/lib/powermix";

const MIX_SOURCE = "https://energy-charts.info/charts/power/chart.htm?l=en&c=BE";

type Slot = { t: number; price: number };

const ZONE = "Europe/Brussels";
const dateKey = (t: number) => new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(t);
const clock = (t: number) => new Date(t).toLocaleTimeString("en-GB", { timeZone: ZONE, hour: "2-digit", minute: "2-digit" });
/** €/MWh → c€/kWh, Belgian style: "12,3" */
const cents = (eurMwh: number) =>
  (eurMwh / 10).toLocaleString("nl-BE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pct = (v: number) => `${Math.round(Math.abs(v) * 100)}%`;
const avg = (xs: Slot[]) => xs.reduce((a, s) => a + s.price, 0) / xs.length;

const DURATIONS = [
  { hours: 1, hint: "Washing machine" },
  { hours: 2, hint: "Dishwasher" },
  { hours: 3, hint: "Dryer" },
  { hours: 4, hint: "Charging a car" },
  { hours: 6, hint: "Long charge" },
];

/** Cheapest run of `count` consecutive slots, starting at or after `fromIdx`. */
function cheapestWindow(slots: Slot[], fromIdx: number, count: number) {
  let best: { start: number; mean: number } | undefined;
  for (let i = fromIdx; i + count <= slots.length; i++) {
    // Only contiguous slots: stop if there's a gap in the data.
    if (slots[i + count - 1].t - slots[i].t !== (count - 1) * (slots[1].t - slots[0].t)) continue;
    const mean = avg(slots.slice(i, i + count));
    if (!best || mean < best.mean) best = { start: i, mean };
  }
  return best;
}

/** Average forecast share of wind and solar over [from, to), if the forecast covers all of it. */
function greenShare(mix: PowerMix | undefined, from: number, to: number) {
  const hours = mix?.forecast.filter((f) => f.t + 3600_000 > from && f.t < to) ?? [];
  if (!hours.length || hours[0].t > from || hours.at(-1)!.t + 3600_000 < to) return undefined;
  return hours.reduce((a, f) => a + f.share, 0) / hours.length;
}

export function PowerBoard({ data, mix }: { data: Extract<PowerData, { ok: true }>; mix?: PowerMix }) {
  const slots = data.slots;
  const step = slots.length > 1 ? slots[1].t - slots[0].t : 3600_000;

  // "Now" is only known in the browser (the page is prerendered); refresh it every minute.
  const [now, setNow] = useState<number>();
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);
  const [hours, setHours] = useState(2);
  const [day, setDay] = useState<"today" | "tomorrow">("today");

  if (now === undefined) {
    return <div className="mt-10 h-96 animate-pulse rounded-2xl bg-line/40 motion-reduce:animate-none" aria-label="Loading prices" />;
  }

  const today = dateKey(now);
  const tomorrow = dateKey(now + 864e5);
  const todaySlots = slots.filter((s) => dateKey(s.t) === today);
  const tomorrowSlots = slots.filter((s) => dateKey(s.t) === tomorrow);
  const nowIdx = slots.findIndex((s) => s.t <= now && now < s.t + step);
  const current = slots[nowIdx];

  if (!current || !todaySlots.length) {
    return (
      <p className="mt-10 rounded-lg border border-line p-4 text-sm">
        There are no prices for today yet. Try again in a few minutes.
      </p>
    );
  }

  const todayAvg = avg(todaySlots);
  const vsAvg = (current.price - todayAvg) / Math.abs(todayAvg);
  const cheapestToday = todaySlots.reduce((a, b) => (b.price < a.price ? b : a));
  const dearestToday = todaySlots.reduce((a, b) => (b.price > a.price ? b : a));

  const count = Math.round((hours * 3600_000) / step);
  const win = cheapestWindow(slots, nowIdx, count);
  const nowWindow = nowIdx + count <= slots.length ? avg(slots.slice(nowIdx, nowIdx + count)) : undefined;
  const saving = win && nowWindow ? (nowWindow - win.mean) / Math.abs(nowWindow) : 0;
  const winStart = win ? slots[win.start].t : undefined;
  const winEnd = win ? slots[win.start + count - 1].t + step : undefined;
  const dayWord = (t: number) => (dateKey(t) === today ? "today" : dateKey(t) === tomorrow ? "tomorrow" : "");

  const shown = day === "tomorrow" && tomorrowSlots.length ? tomorrowSlots : todaySlots;
  const winGreen = winStart !== undefined && winEnd !== undefined ? greenShare(mix, winStart, winEnd) : undefined;
  const nowGreen = greenShare(mix, now, now + 3600_000);

  return (
    <div className="pb-8">
      <div className="mt-10 grid gap-6 sm:grid-cols-[auto_1fr] sm:items-end sm:gap-12">
        <div>
          <p className="text-sm text-muted">
            Right now, {clock(current.t)}–{clock(current.t + step)}
          </p>
          <p className="mt-1 text-6xl font-semibold tracking-tight tabular-nums">
            {cents(current.price)}
            <span className="ml-2 text-xl font-normal text-muted">c/kWh</span>
          </p>
          <p className={`mt-2 text-sm ${vsAvg <= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
            {Math.abs(vsAvg) < 0.03 ? "About today's average" : `${pct(vsAvg)} ${vsAvg < 0 ? "below" : "above"} today's average`}
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-4 text-sm sm:max-w-md">
          <div className="border-l-2 border-emerald-500 pl-3">
            <dt className="text-muted">Cheapest today</dt>
            <dd className="mt-0.5 font-medium tabular-nums">
              {cents(cheapestToday.price)} c at {clock(cheapestToday.t)}
            </dd>
          </div>
          <div className="border-l-2 border-rose-500 pl-3">
            <dt className="text-muted">Most expensive</dt>
            <dd className="mt-0.5 font-medium tabular-nums">
              {cents(dearestToday.price)} c at {clock(dearestToday.t)}
            </dd>
          </div>
        </dl>
      </div>

      <section aria-labelledby="plan" className="mt-12 panel p-5 sm:p-7">
        <h2 id="plan" className="text-xl font-semibold tracking-tight">
          When should I run it?
        </h2>
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="How long it runs">
          {DURATIONS.map((d) => (
            <button
              key={d.hours}
              type="button"
              aria-pressed={hours === d.hours}
              onClick={() => setHours(d.hours)}
              className={`rounded-lg border px-3 py-1.5 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                hours === d.hours ? "border-foreground bg-foreground text-background" : "border-line hover:border-foreground"
              }`}
            >
              <span className="font-medium">{d.hours} h</span>
              <span className={hours === d.hours ? "opacity-70" : "text-muted"}> · {d.hint}</span>
            </button>
          ))}
        </div>
        <div className="mt-6" aria-live="polite">
          {win && winStart !== undefined && winEnd !== undefined ? (
            <>
              <p className="text-3xl font-semibold tracking-tight">
                {win.start === nowIdx ? "Start now" : `Start at ${clock(winStart)}`}
                {win.start === nowIdx ? "" : <span className="text-muted"> {dayWord(winStart)}</span>}
              </p>
              <p className="mt-2 text-muted">
                Runs until {clock(winEnd)} {dayWord(winEnd) !== dayWord(winStart) ? dayWord(winEnd) : ""} at{" "}
                <span className="text-foreground tabular-nums">{cents(win.mean)} c/kWh</span> on average
                {saving > 0.02 ? (
                  <>
                    , <span className="text-emerald-600 dark:text-emerald-400">{pct(saving)} cheaper</span> than starting now
                  </>
                ) : null}
                .
              </p>
              {winGreen !== undefined && nowGreen !== undefined ? (
                <p className="mt-1 text-muted">
                  About <span className="text-foreground tabular-nums">{Math.round(winGreen)}%</span> of the power
                  should come from wind and sun then
                  {Math.abs(winGreen - nowGreen) >= 3
                    ? `, ${winGreen > nowGreen ? "more" : "less"} than the ${Math.round(nowGreen)}% right now`
                    : ""}
                  .
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-muted">There aren&apos;t enough known prices left to fit {hours} hours. Tomorrow&apos;s prices come out around 13:00.</p>
          )}
        </div>
      </section>

      <section aria-labelledby="day" className="mt-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 id="day" className="text-xl font-semibold tracking-tight">
            Prices through the day
          </h2>
          <div className="flex rounded-lg border border-line p-0.5 text-sm" role="group" aria-label="Day">
            {(["today", "tomorrow"] as const).map((d) => {
              const disabled = d === "tomorrow" && !tomorrowSlots.length;
              return (
                <button
                  key={d}
                  type="button"
                  disabled={disabled}
                  aria-pressed={day === d}
                  onClick={() => setDay(d)}
                  className={`rounded-md px-3 py-1 capitalize outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-40 ${
                    day === d && !disabled ? "bg-foreground text-background" : "text-muted hover:text-foreground"
                  }`}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>
        {!tomorrowSlots.length ? (
          <p className="mt-2 text-sm text-muted">Tomorrow&apos;s prices are published around 13:00.</p>
        ) : null}
        <div className="mt-5 panel p-3 sm:p-5">
          <PriceBars
            slots={shown}
            step={step}
            now={now}
            highlight={winStart !== undefined && winEnd !== undefined ? [winStart, winEnd] : undefined}
          />
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
          <li className="flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-emerald-500" aria-hidden /> Cheapest third of the day
          </li>
          <li className="flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-rose-500" aria-hidden /> Most expensive third
          </li>
          <li className="flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-accent/30 ring-1 ring-accent" aria-hidden /> Your cheapest {hours} h
          </li>
        </ul>
      </section>

      {mix ? <MixSection mix={mix} now={now} /> : null}
    </div>
  );
}

const SOURCE_COLOR: Record<string, string> = {
  nuclear: "bg-violet-500",
  gas: "bg-orange-500",
  wind: "bg-sky-500",
  solar: "bg-yellow-400",
  bio: "bg-lime-600",
  storage: "bg-teal-500",
  other: "bg-stone-400",
  // Hatched: not a source of its own, just what came in from abroad.
  imports: "bg-[repeating-linear-gradient(135deg,var(--color-muted)_0_2px,transparent_2px_6px)] ring-1 ring-inset ring-muted/60",
};

function MixSection({ mix, now }: { mix: PowerMix; now: number }) {
  const total = mix.sources.reduce((a, s) => a + s.mw, 0);
  const share = (mw: number) => Math.round((mw / total) * 100);
  const gw = (mw: number) => (mw / 1000).toLocaleString("en-GB", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const peak = mix.forecast.length ? mix.forecast.reduce((a, b) => (b.share > a.share ? b : a)) : undefined;
  return (
    <section aria-labelledby="mix" className="mt-14">
      <h2 id="mix" className="text-xl font-semibold tracking-tight">
        Where it comes from
      </h2>
      <p className="mt-2 max-w-xl text-muted">
        Between {clock(mix.at)} and {clock(mix.at + 3600_000)}, renewables covered{" "}
        <span className="font-medium text-foreground tabular-nums">{Math.round(mix.renewableShare)}%</span> of what
        Belgium used{mix.exportMw > 0 ? `, and ${gw(mix.exportMw)} GW went abroad` : ""}.
        {peak ? ` Wind and sun should peak at ${Math.round(peak.share)}% around ${clock(peak.t)} today.` : ""}
      </p>
      <div className="mt-5 flex h-10 overflow-hidden rounded-lg" role="img" aria-label={mix.sources.map((s) => `${s.label} ${share(s.mw)}%`).join(", ")}>
        {mix.sources.map((s) => (
          <div
            key={s.id}
            className={`${SOURCE_COLOR[s.id]} border-r-2 border-background last:border-r-0`}
            style={{ width: `${(s.mw / total) * 100}%` }}
            title={`${s.label}: ${share(s.mw)}%`}
          />
        ))}
      </div>
      <ul className="mt-4 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
        {mix.sources.map((s) => (
          <li key={s.id} className="flex items-center gap-2">
            <span className={`size-2.5 shrink-0 rounded-sm ${SOURCE_COLOR[s.id]}`} aria-hidden />
            <span>{s.label}</span>
            <span className="ml-auto tabular-nums text-muted sm:ml-0">
              {share(s.mw)}% · {gw(s.mw)} GW
            </span>
          </li>
        ))}
      </ul>
      {mix.forecast.length ? <GreenStrip forecast={mix.forecast} now={now} /> : null}
      <p className="mt-4 text-xs text-muted">
        Measured production is published a few hours late; the hourly share is a forecast. Source:{" "}
        <a href={MIX_SOURCE} className="underline underline-offset-4 hover:text-foreground">
          Energy-Charts public power
        </a>
        .
      </p>
    </section>
  );
}

/** Today's forecast share of wind and solar per hour, as a row of tinted cells. */
function GreenStrip({ forecast, now }: { forecast: PowerMix["forecast"]; now: number }) {
  return (
    <div className="mt-8">
      <p className="text-sm text-muted">Forecast share of wind and sun per hour today: the stronger the green, the more</p>
      <div className="-mx-4 mt-2 overflow-x-auto px-4 pb-1">
        <ol className="flex min-w-[560px] gap-0.5">
          {forecast.map((f) => (
            <li key={f.t} className="flex flex-1 flex-col items-center gap-1 text-[10px] text-muted">
              <span
                className="h-6 w-full rounded-sm bg-emerald-500"
                style={{ opacity: 0.12 + (Math.min(f.share, 80) / 80) * 0.88 }}
                title={`${clock(f.t)}: ${Math.round(f.share)}%`}
                aria-hidden
              />
              <span className={`tabular-nums ${f.t <= now && now < f.t + 3600_000 ? "font-medium text-foreground" : ""}`}>
                {f.t <= now && now < f.t + 3600_000 ? "Now" : clock(f.t).slice(0, 2)}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

const PAD = { top: 10, right: 8, bottom: 22, left: 36 };

function PriceBars({
  slots,
  step,
  now,
  highlight,
}: {
  slots: Slot[];
  step: number;
  now: number;
  highlight?: [number, number];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number>();
  const height = 240;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const prices = slots.map((s) => s.price);
  const max = Math.max(...prices, 1);
  const min = Math.min(...prices, 0);
  const sorted = [...prices].sort((a, b) => a - b);
  const low = sorted[Math.floor(sorted.length / 3)];
  const high = sorted[Math.floor((sorted.length * 2) / 3)];
  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = height - PAD.top - PAD.bottom;
  const bw = slots.length ? innerW / slots.length : 0;
  const y = (v: number) => PAD.top + ((max - v) / (max - min)) * innerH;
  const gap = bw > 5 ? 1 : 0;
  const ticks = [0, max / 2, max].concat(min < 0 ? [min] : []);
  const hovered = hover !== undefined ? slots[hover] : undefined;

  return (
    <div ref={ref} className="relative" onPointerLeave={() => setHover(undefined)}>
      {width ? (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`Electricity price per ${step / 60000} minutes, from ${cents(Math.min(...prices))} to ${cents(max)} cents per kWh`}
          onPointerMove={(e) => {
            const x = e.clientX - e.currentTarget.getBoundingClientRect().left - PAD.left;
            const i = Math.floor(x / bw);
            setHover(i >= 0 && i < slots.length ? i : undefined);
          }}
        >
          {highlight ? (
            <rect
              x={PAD.left + Math.max(0, (highlight[0] - slots[0].t) / step) * bw}
              width={Math.max(0, (Math.min(highlight[1], slots.at(-1)!.t + step) - Math.max(highlight[0], slots[0].t)) / step) * bw}
              y={PAD.top - 6}
              height={innerH + 6}
              rx={4}
              className="fill-accent/15 stroke-accent"
              strokeWidth={1}
            />
          ) : null}
          {ticks.map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} className="stroke-line" strokeDasharray={v === 0 ? undefined : "2 3"} />
              <text x={PAD.left - 6} y={y(v)} dy="0.32em" textAnchor="end" className="fill-muted text-[10px] tabular-nums">
                {cents(v)}
              </text>
            </g>
          ))}
          {slots.map((s, i) => {
            const top = Math.min(y(s.price), y(0));
            const h = Math.max(1, Math.abs(y(s.price) - y(0)));
            const tone = s.price <= low ? "fill-emerald-500" : s.price >= high ? "fill-rose-500" : "fill-muted/40";
            const past = s.t + step <= now;
            return (
              <rect
                key={s.t}
                x={PAD.left + i * bw + gap / 2}
                y={top}
                width={Math.max(0.5, bw - gap)}
                height={h}
                className={`${tone} ${past ? "opacity-35" : ""} ${hover === i ? "opacity-100 brightness-110" : ""}`}
              />
            );
          })}
          {slots.some((s) => s.t <= now && now < s.t + step) ? (
            <line
              x1={PAD.left + ((now - slots[0].t) / step) * bw}
              x2={PAD.left + ((now - slots[0].t) / step) * bw}
              y1={PAD.top - 6}
              y2={PAD.top + innerH}
              className="stroke-foreground"
              strokeWidth={1.5}
            />
          ) : null}
          {[0, 6, 12, 18].map((hr) => {
            const i = slots.findIndex((s) => clock(s.t) === `${String(hr).padStart(2, "0")}:00`);
            return i < 0 ? null : (
              <text key={hr} x={PAD.left + i * bw} y={height - 6} className="fill-muted text-[10px]">
                {String(hr).padStart(2, "0")}:00
              </text>
            );
          })}
        </svg>
      ) : (
        <div style={{ height }} />
      )}
      {hovered && hover !== undefined ? (
        <div
          className="pointer-events-none absolute top-0 rounded-md border border-line bg-background px-2 py-1 text-xs shadow-sm tabular-nums"
          style={{
            left: Math.min(Math.max(0, PAD.left + hover * bw - 50), width - 110),
          }}
        >
          {clock(hovered.t)}–{clock(hovered.t + step)} · <span className="font-medium">{cents(hovered.price)} c/kWh</span>
        </div>
      ) : null}
    </div>
  );
}
