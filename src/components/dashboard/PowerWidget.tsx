"use client";

import { useEffect, useState } from "react";
import { useReportCheapest } from "./Today";

type Slot = { t: number; price: number };

/** €/MWh → c€/kWh, Belgian style: "12,3" */
const cents = (eurMwh: number) =>
  (eurMwh / 10).toLocaleString("nl-BE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const clock = (t: number) => new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const HOUR = 3_600_000;

/** Hourly averages from the start of today until the last published slot. */
function hourly(slots: Slot[], now: number) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const buckets = new Map<number, number[]>();
  for (const s of slots) {
    if (s.t < start.getTime()) continue;
    const h = s.t - (s.t % HOUR);
    buckets.set(h, [...(buckets.get(h) ?? []), s.price]);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, ps]) => ({ t, price: ps.reduce((a, b) => a + b, 0) / ps.length }));
}

/** The price now, the cheapest hour still to come, and every hour of today (and tomorrow, once published). */
export function PowerWidget({ slots }: { slots: Slot[] }) {
  const [now, setNow] = useState<number>();
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  const step = slots.length > 1 ? slots[1].t - slots[0].t : 15 * 60_000;
  const current = now ? slots.find((s) => s.t <= now && now < s.t + step) : undefined;
  const hours = now ? hourly(slots, now) : [];
  const thisHour = now ? now - (now % HOUR) : 0;
  const ahead = hours.filter((h) => h.t >= thisHour);
  const cheapest = ahead.reduce<(typeof ahead)[number] | undefined>((b, h) => (!b || h.price < b.price ? h : b), undefined);
  useReportCheapest(cheapest ? { t: cheapest.t, cents: cents(cheapest.price) } : undefined);

  if (!now) return <div className="flex-1" />;
  if (!current) return <p className="text-[15px] text-muted">No price for this moment yet.</p>;
  const tomorrow = cheapest && new Date(cheapest.t).toDateString() !== new Date(now).toDateString();

  return (
    <>
      <div className="flex flex-wrap items-end gap-x-10 gap-y-3">
        <p className="flex items-baseline gap-2">
          <span className="readout text-5xl leading-none font-semibold tracking-[-0.04em]">{cents(current.price)}</span>
          <span className="text-[15px] text-muted">cent per kWh now</span>
        </p>
        {cheapest ? (
          <p className="inline-flex items-center gap-2 rounded-full bg-good-soft px-3 py-1.5 text-sm font-medium text-good">
            <span aria-hidden className="size-2 rounded-full bg-good-dot" />
            Cheapest ahead: {clock(cheapest.t)}
            {tomorrow ? " tomorrow" : ""}, {cents(cheapest.price)} cent
          </p>
        ) : null}
      </div>
      <PriceBars hours={hours} thisHour={thisHour} cheapest={cheapest?.t} />
    </>
  );
}

function PriceBars({ hours, thisHour, cheapest }: { hours: { t: number; price: number }[]; thisHour: number; cheapest?: number }) {
  if (hours.length < 2) return null;
  const prices = hours.map((h) => h.price);
  const max = Math.max(...prices);
  // Start the scale a little below the lowest price so differences show.
  const min = Math.min(0, ...prices) < 0 ? Math.min(...prices) : Math.min(...prices) * 0.7;
  const range = max - min || 1;
  const ticks = hours.filter((h) => new Date(h.t).getHours() % 6 === 0);
  return (
    <figure className="mt-auto pt-6">
      <figcaption className="sr-only">Price per hour. The current hour is dark, the cheapest hour ahead is green.</figcaption>
      <div className="flex h-[120px] items-end gap-1">
        {hours.map((h) => {
          const tone =
            h.t === thisHour ? "bg-foreground" : h.t === cheapest ? "bg-good-dot" : h.t < thisHour ? "bg-bar-past" : "bg-bar";
          return (
            <span
              key={h.t}
              title={`${clock(h.t)}: ${cents(h.price)} cent/kWh`}
              className={`min-w-0 flex-1 rounded-t-[4px] rounded-b-[2px] ${tone}`}
              style={{ height: `${Math.max(4, ((h.price - min) / range) * 100)}%` }}
            />
          );
        })}
      </div>
      <div className="relative mt-2 h-4 text-xs text-muted">
        {ticks.map((h) => (
          <span
            key={h.t}
            className="absolute"
            style={{ left: `${(hours.indexOf(h) / hours.length) * 100}%` }}
          >
            {clock(h.t)}
          </span>
        ))}
      </div>
    </figure>
  );
}
