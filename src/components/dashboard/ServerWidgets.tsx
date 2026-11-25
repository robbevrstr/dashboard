// Tiles whose data comes from the server: the fuel and power APIs (cached) and the
// settings database. Each one is rendered at request time inside its own Suspense boundary.
import Link from "next/link";
import { connection } from "next/server";
import { FUELS, getFuelData } from "@/lib/fuel";
import { getPowerPrices } from "@/lib/power";
import { getSetting } from "@/lib/settings";
import { PowerWidget } from "./PowerWidget";
import { Widget, WidgetError } from "./Widget";

const euro = (v: number) =>
  v.toLocaleString("nl-BE", { style: "currency", currency: "EUR", minimumFractionDigits: 3, maximumFractionDigits: 3 });
const price = (v: number) => v.toLocaleString("nl-BE", { style: "currency", currency: "EUR" });
const centDiff = (v: number) => `${v > 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(1).replace(".", ",")} cent`;

export async function PowerTile() {
  await connection();
  const data = await getPowerPrices();
  return (
    <Widget title="Electricity in Belgium" note="Day-ahead price, excl. VAT" href="/apps/power" className="flex-[7_1_520px]">
      {data.ok ? (
        <PowerWidget slots={data.slots} />
      ) : (
        <WidgetError>Prices didn&apos;t load. Open the app to try again.</WidgetError>
      )}
    </Widget>
  );
}

const SHOWN = ["e10", "e5_98", "diesel", "lpg"] as const;

export async function FuelTile() {
  await connection();
  const data = await getFuelData();
  const today = data.ok ? data.prices.e10.at(-1)?.date : undefined;
  return (
    <Widget title="Fuel in Belgium" note="Maximum price per litre" href="/apps/fuel" className="flex-[5_1_360px]">
      {!data.ok ? (
        <WidgetError>Prices didn&apos;t load. Open the app to try again.</WidgetError>
      ) : (
        <>
          <ul className="-mt-2">
            {SHOWN.map((id) => {
              const fuel = FUELS.find((f) => f.id === id)!;
              const list = data.prices[id];
              const last = list.at(-1);
              const prev = last ? [...list].reverse().find((p) => p.price !== last.price) : undefined;
              const diff = last && prev ? last.price - prev.price : 0;
              return (
                <li key={id} className="flex items-center justify-between gap-3 border-t border-line py-3.5 first:border-t-0">
                  <span className="text-[15px] font-medium">
                    {fuel.label} <span className="font-normal text-muted">{fuel.detail}</span>
                  </span>
                  <span className="flex items-center gap-3.5">
                    <span className={`text-[13px] ${diff > 0 ? "text-poor" : diff < 0 ? "text-good" : "text-muted"}`}>
                      {diff ? centDiff(diff) : "No change"}
                    </span>
                    <span className="min-w-[76px] text-right text-xl font-medium tracking-[-0.02em]">{last ? euro(last.price) : "–"}</span>
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-auto pt-2 text-[13px] text-muted">
            Set by FOD Economie
            {today ? ` for ${new Date(today).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}` : ""}. Changes
            since the previous price.
          </p>
        </>
      )}
    </Widget>
  );
}

type Saved = { query: string; lowest?: number; checkedAt?: string; target?: number; alert?: unknown };

export async function WatchlistTile() {
  await connection();
  const raw = await getSetting<unknown>("comparer:saved");
  const items = (Array.isArray(raw) ? (raw as Saved[]) : []).filter((s) => typeof s?.query === "string");
  return (
    <Widget
      title="Watchlist"
      note={items.length ? `${items.length} saved, six Belgian shops` : "Six Belgian shops"}
      href="/apps/comparer"
      className="flex-[8_1_520px]"
    >
      {items.length ? (
        <ul className="-mt-2 grid gap-x-8 sm:grid-cols-2">
          {items.slice(0, 8).map((s) => {
            const hit = s.target !== undefined && s.lowest !== undefined && s.lowest <= s.target;
            return (
              <li key={s.query} className="flex items-center justify-between gap-3 border-b border-line py-3">
                <span className="min-w-0 truncate text-[15px]">
                  {s.query}
                  {s.alert ? (
                    <span className="ml-2 rounded-full bg-good-soft px-2 py-0.5 text-xs font-medium text-good">Price drop</span>
                  ) : null}
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-[15px] font-medium">{s.lowest !== undefined ? price(s.lowest) : "–"}</span>
                  {s.target !== undefined ? (
                    <span className={`block text-xs ${hit ? "text-good" : "text-muted"}`}>
                      {hit ? "Target reached" : `Target ${price(s.target)}`}
                    </span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="max-w-[520px] text-[15px] leading-relaxed text-muted">
          Follow the price of something you want to buy. Save it from a search and its lowest price shows up here, with
          an alert when it hits your target.
        </p>
      )}
      <form action="/apps/comparer" className="mt-auto flex flex-wrap gap-2 pt-5">
        <label htmlFor="watch-q" className="sr-only">
          Product to search for
        </label>
        <input
          id="watch-q"
          name="q"
          type="search"
          required
          minLength={2}
          maxLength={80}
          placeholder="Search a product, e.g. a phone or headphones"
          className="h-11 min-w-0 flex-[1_1_260px] rounded-[10px] border border-line bg-background px-3.5 text-[15px] outline-none placeholder:text-muted focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30"
        />
        <button
          type="submit"
          className="h-11 rounded-[10px] bg-foreground px-4.5 text-[15px] font-medium text-surface outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          Compare prices
        </button>
      </form>
    </Widget>
  );
}

export async function GamesTile() {
  await connection();
  const [clock, colour, round, saucer] = await Promise.all([
    getSetting<Record<string, number>>("stop-the-clock-best"),
    getSetting<number>("colour-memory-best"),
    getSetting<number>("how-round-best"),
    getSetting<number>("saucer-game-best"),
  ]);
  const clockBest = clock && typeof clock === "object" ? Object.values(clock).filter(Number.isFinite) : [];
  const closest = clockBest.length ? clockBest.reduce((a, b) => (Math.abs(b) < Math.abs(a) ? b : a)) : undefined;
  const rows: { label: string; href: string; value?: string }[] = [
    {
      label: "Stop the clock",
      href: "/apps/stop-the-clock",
      value: closest !== undefined ? `${closest >= 0 ? "+" : "−"}${Math.abs(closest).toFixed(2)} s` : undefined,
    },
    { label: "Colour memory", href: "/apps/colour-memory", value: typeof colour === "number" ? `${colour} / 50` : undefined },
    { label: "How round?", href: "/apps/circle", value: typeof round === "number" ? `${round}%` : undefined },
  ];
  if (typeof saucer === "number") {
    // The secret game only shows up once you've found it.
    rows.push({ label: "Asteroid run", href: "/", value: `${Math.round(saucer).toLocaleString("en-GB")} km` });
  }
  return (
    <Widget title="Games" note="Your best" href="/apps#games" className="flex-[4_1_300px]">
      <ul className="-mt-2">
        {rows.map((r) => (
          <li key={r.label} className="border-t border-line first:border-t-0">
            <Link
              href={r.href}
              className="flex min-h-12 items-center justify-between gap-3 text-[15px] outline-none hover:underline hover:underline-offset-[3px] focus-visible:underline"
            >
              <span>{r.label}</span>
              <span className={r.value ? "font-medium" : "text-sm text-muted"}>{r.value ?? "Not played yet"}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Widget>
  );
}
