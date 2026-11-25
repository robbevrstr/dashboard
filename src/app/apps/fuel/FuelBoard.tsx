"use client";

import { useEffect, useState } from "react";
import { LineChart } from "@/components/LineChart";
import type { FuelData, FuelId } from "@/lib/fuel";

type Fuel = { id: FuelId; label: string; detail: string; color: string };
type Row = { date: string; price: number };

const euro3 = (v: number) =>
  v.toLocaleString("nl-BE", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

const dayLabel = (date: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("en-GB", opts);

const brusselsToday = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date());

const RANGES = [
  { days: 30, label: "1 month" },
  { days: 91, label: "3 months" },
  { days: 365, label: "1 year" },
];

/** Price in force on `today`, when it last changed, and any announced change. */
function summarize(rows: Row[], today: string) {
  const pastIdx = rows.findLastIndex((r) => r.date <= today);
  if (pastIdx < 0) return undefined;
  const now = rows[pastIdx];
  let start = pastIdx;
  while (start > 0 && rows[start - 1].price === now.price) start--;
  const before = start > 0 ? rows[start - 1] : undefined;
  const next = rows.slice(pastIdx + 1).find((r) => r.price !== now.price);
  const year = rows.filter((r) => r.date <= today);
  const low = year.reduce((a, b) => (b.price < a.price ? b : a));
  const high = year.reduce((a, b) => (b.price > a.price ? b : a));
  return { now, since: rows[start].date, before, next, low, high };
}

export function FuelBoard({ data, fuels }: { data: Extract<FuelData, { ok: true }>; fuels: Fuel[] }) {
  // The page is prerendered; pick "today" in the browser so it's always current.
  const latest = fuels.map((f) => data.prices[f.id].at(-1)?.date ?? "").sort()[0];
  const [today, setToday] = useState(latest);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the current date is only known in the browser
    setToday(brusselsToday());
  }, []);

  const [range, setRange] = useState(91);
  const [shown, setShown] = useState<Set<FuelId>>(new Set(["e10", "diesel"]));

  const summaries = fuels.map((f) => ({ fuel: f, s: summarize(data.prices[f.id], today) }));
  const announced = summaries.filter(({ s }) => s?.next);

  const cutoff = new Date(Date.parse(`${today}T00:00:00Z`) - range * 864e5).toISOString().slice(0, 10);
  const series = fuels
    .filter((f) => shown.has(f.id))
    .map((f) => ({
      id: f.id,
      label: f.label,
      color: f.color,
      points: data.prices[f.id]
        .filter((r) => r.date >= cutoff && r.date <= today)
        .map((r) => ({ t: Date.parse(`${r.date}T12:00:00Z`), v: r.price })),
    }));

  return (
    <div className="pb-20">
      {/* The pump sign: the one loud element on the page. Always dark, like the real thing. */}
      <section
        aria-label={`Maximum prices for ${dayLabel(today, { weekday: "long", day: "numeric", month: "long" })}`}
        className="mt-10 overflow-hidden rounded-md bg-[#110e26] text-[#ece9ff] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]"
      >
        <div className="flex items-baseline justify-between gap-4 border-b border-white/10 px-5 py-3 text-sm sm:px-7">
          <span className="font-medium">
            <span className="hidden sm:inline">Maximum price </span>
            <span className="sm:hidden">Max. </span>per litre
          </span>
          <span className="whitespace-nowrap text-white/60">
            <span className="hidden sm:inline">{dayLabel(today, { weekday: "long", day: "numeric", month: "long" })}</span>
            <span className="sm:hidden">{dayLabel(today, { weekday: "short", day: "numeric", month: "short" })}</span>
          </span>
        </div>
        <ul className="divide-y divide-white/10">
          {summaries.map(({ fuel, s }) =>
            s ? (
              <li key={fuel.id} className="grid grid-cols-[1fr_auto] items-center gap-x-4 px-5 py-4 sm:grid-cols-[1fr_auto_12rem] sm:px-7">
                <div className="flex items-center gap-3">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: fuel.color }} aria-hidden />
                  <div>
                    <div className="font-medium">{fuel.label}</div>
                    <div className="text-xs text-white/50">{fuel.detail}</div>
                  </div>
                </div>
                <div className="text-right font-mono text-3xl font-medium tracking-tight text-[#ffc94d] tabular-nums sm:text-4xl">
                  <span className="sr-only">€ </span>
                  {euro3(s.now.price)}
                </div>
                <Change s={s} />
              </li>
            ) : null,
          )}
        </ul>
      </section>

      {announced.length ? (
        <p className="mt-4 text-sm">
          <span className="font-medium">Announced: </span>
          {announced.map(({ fuel, s }, i) => (
            <span key={fuel.id}>
              {i ? "; " : ""}
              {fuel.label} {s!.next!.price < s!.now.price ? "drops" : "rises"} to €{euro3(s!.next!.price)} on{" "}
              {dayLabel(s!.next!.date, { weekday: "long" })}
            </span>
          ))}
          .
        </p>
      ) : null}

      <section aria-labelledby="trend" className="mt-14">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 id="trend" className="text-2xl font-semibold tracking-tight">
            Price trend
          </h2>
          <div className="flex rounded-lg border border-line p-0.5 text-sm" role="group" aria-label="Time range">
            {RANGES.map((r) => (
              <button
                key={r.days}
                type="button"
                aria-pressed={range === r.days}
                onClick={() => setRange(r.days)}
                className={`rounded-md px-3 py-1 outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  range === r.days ? "bg-foreground text-background" : "text-muted hover:text-foreground"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Fuels on the chart">
          {fuels.map((f) => {
            const on = shown.has(f.id);
            return (
              <button
                key={f.id}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setShown((prev) => {
                    const next = new Set(prev);
                    if (next.has(f.id) && next.size > 1) next.delete(f.id);
                    else next.add(f.id);
                    return next;
                  })
                }
                className={`flex items-center gap-2 rounded-md border px-2.5 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  on ? "border-foreground/40 bg-surface" : "border-line text-muted"
                }`}
              >
                <span
                  className="size-2.5 rounded-full"
                  style={{ background: on ? f.color : "transparent", boxShadow: `inset 0 0 0 1.5px ${f.color}` }}
                  aria-hidden
                />
                {f.label}
              </button>
            );
          })}
        </div>

        <div className="mt-6 panel p-3 sm:p-5">
          <LineChart
            label={`Maximum fuel prices over the last ${RANGES.find((r) => r.days === range)?.label}`}
            series={series}
            formatValue={(v) => `€${euro3(v)}`}
            formatDate={(t) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
            height={280}
            step
          />
        </div>

        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm tabular-nums">
            <caption className="mb-3 text-left font-medium">Over the past year</caption>
            <thead>
              <tr className="border-b border-line text-left text-muted">
                <th className="py-2 pr-4 font-normal">Fuel</th>
                <th className="py-2 pr-4 text-right font-normal">Today</th>
                <th className="py-2 pr-4 text-right font-normal">Lowest</th>
                <th className="py-2 text-right font-normal">Highest</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map(({ fuel, s }) =>
                s ? (
                  <tr key={fuel.id} className="border-b border-line">
                    <th scope="row" className="py-2.5 pr-4 text-left font-medium">
                      {fuel.label}
                    </th>
                    <td className="py-2.5 pr-4 text-right">€{euro3(s.now.price)}</td>
                    <td className="py-2.5 pr-4 text-right">
                      €{euro3(s.low.price)} <span className="text-muted">{dayLabel(s.low.date)}</span>
                    </td>
                    <td className="py-2.5 text-right">
                      €{euro3(s.high.price)} <span className="text-muted">{dayLabel(s.high.date)}</span>
                    </td>
                  </tr>
                ) : null,
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Change({ s }: { s: NonNullable<ReturnType<typeof summarize>> }) {
  if (!s.before) return <span className="hidden sm:block" />;
  const diff = s.now.price - s.before.price;
  const down = diff < 0;
  return (
    <div className="col-span-2 text-right text-sm whitespace-nowrap sm:col-span-1">
      <span className={down ? "text-emerald-400" : "text-rose-400"}>
        <span aria-hidden>{down ? "▼" : "▲"}</span>
        <span className="sr-only">{down ? "Down" : "Up"}</span> €{euro3(Math.abs(diff))}
      </span>{" "}
      <span className="text-white/50">since {dayLabel(s.since)}</span>
    </div>
  );
}
