"use client";

// Everything on the dashboard that depends on your saved place: the clock and briefing at the
// top, "Going out" and "Tonight's sky". The forecast is fetched once here and shared. The
// electricity tile reports its cheapest hour back, so the briefing can mention it.
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Observer } from "astronomy-engine";
import {
  type Activity,
  ACTIVITIES,
  type Air,
  airUrl,
  type Forecast,
  forecastUrl,
  type Level,
  parseAir,
  parseForecast,
  type Place,
  PLACES,
  rate,
  tips,
  toUnix,
} from "@/lib/bike";
import { type Cloud, cloudsUrl, type CloudVerdict, cloudVerdict, moonInfo, type Night, nightOf, parseClouds } from "@/lib/sky";
import { loadSetting } from "@/lib/store";
import { elevation } from "@/lib/sun";
import { Pulse, Widget, WidgetError } from "./Widget";

const DEFAULT = PLACES.find((p) => p.name === "Brussels")!;
const isPlace = (p: unknown): p is Place =>
  !!p && typeof (p as Place).name === "string" && Number.isFinite((p as Place).lat) && Number.isFinite((p as Place).lon);
const isActivity = (a: unknown): a is Activity => ACTIVITIES.includes(a as Activity);
const clock = (t: number) => new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const deg = (v: number) => `${v < 0 ? "−" : ""}${Math.abs(Math.round(v))}°`;

type Loaded<T> = { data?: T; error?: boolean };
type Cheapest = { t: number; cents: string } | undefined;

type TodayData = {
  place?: Place;
  activity: Activity;
  forecast: Loaded<Forecast>;
  air: Loaded<Air>;
  clouds: Loaded<Cloud[]>;
  cheapest: Cheapest;
  /** The time, refreshed every minute; undefined until the page runs in the browser. */
  now?: number;
  setCheapest: (c: Cheapest) => void;
};

const TodayContext = createContext<TodayData | undefined>(undefined);

function useToday() {
  const ctx = useContext(TodayContext);
  if (!ctx) throw new Error("useToday outside <TodayProvider>");
  return ctx;
}

/** Lets the electricity tile (rendered on the server) tell the briefing its cheapest hour. */
export function useReportCheapest(c: Cheapest) {
  const setCheapest = useContext(TodayContext)?.setCheapest;
  const key = c ? `${c.t}:${c.cents}` : "";
  useEffect(() => {
    setCheapest?.(c);
    // the key captures c
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, setCheapest]);
}

function useJson<T>(url: string | undefined, parse: (raw: never) => T): Loaded<T> {
  const [state, setState] = useState<Loaded<T>>({});
  useEffect(() => {
    if (!url) return;
    const ctrl = new AbortController();
    fetch(url, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((raw) => setState({ data: parse(raw as never) }))
      .catch(() => {
        if (!ctrl.signal.aborted) setState({ error: true });
      });
    return () => ctrl.abort();
    // parse is a module-level function
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);
  return state;
}

export function TodayProvider({ children }: { children: React.ReactNode }) {
  const [saved, setSaved] = useState<{ place: Place; activity: Activity }>();
  const [cheapest, setCheapest] = useState<Cheapest>();
  const now = useNow(60_000);
  useEffect(() => {
    let live = true;
    Promise.all([loadSetting("bike-place", isPlace), loadSetting("bike-activity", isActivity)]).then(([p, a]) => {
      if (live) setSaved({ place: p ?? DEFAULT, activity: a ?? "bike" });
    });
    return () => {
      live = false;
    };
  }, []);
  const place = saved?.place;
  const forecast = useJson<Forecast>(place && forecastUrl(place.lat, place.lon), parseForecast);
  const air = useJson<Air>(place && airUrl(place.lat, place.lon), parseAir);
  const clouds = useJson<Cloud[]>(place && cloudsUrl(place.lat, place.lon), parseClouds);
  const value = useMemo(
    () => ({ place, activity: saved?.activity ?? "bike", forecast, air, clouds, cheapest, now, setCheapest }),
    [place, saved?.activity, forecast, air, clouds, cheapest, now],
  );
  return <TodayContext.Provider value={value}>{children}</TodayContext.Provider>;
}

/* ------------------------------------------------------------------ the top of the page */

function useNow(everyMs: number) {
  const [now, setNow] = useState<number>();
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    // Line up with the start of each interval so the clock turns over on time.
    let id: ReturnType<typeof setInterval> | undefined;
    const t = setTimeout(() => {
      tick();
      id = setInterval(tick, everyMs);
    }, everyMs - (Date.now() % everyMs));
    return () => {
      clearTimeout(t);
      clearInterval(id);
    };
  }, [everyMs]);
  return now;
}

/** Date, a large clock and a sentence or two about the day. */
export function Hero() {
  const now = useNow(1000);
  const today = useToday();
  const brief = now ? briefing(today, now) : undefined;
  const date = now ? new Date(now).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }) : " ";
  const time = now ? clock(now) : "--:--";

  return (
    <section aria-label="Today" className="flex flex-wrap items-end gap-x-16 gap-y-6 pt-10 pb-10 sm:pt-12">
      <div className="shrink-0">
        <p className="text-[15px] text-muted">{date}</p>
        <p className="readout mt-1 text-7xl leading-[0.95] font-semibold tracking-[-0.045em] sm:text-[88px]">
          <time dateTime={now ? new Date(now).toISOString() : undefined}>{time}</time>
        </p>
      </div>
      <p className="max-w-[620px] min-w-0 flex-[1_1_360px] text-xl leading-snug tracking-[-0.01em] text-muted sm:text-[22px]" aria-live="polite">
        {brief ? (
          <>
            <span className="text-foreground">{brief.lead}</span>
            {brief.rest ? ` ${brief.rest}` : ""}
          </>
        ) : (
          <span className="inline-block h-6 w-80 max-w-full animate-pulse rounded bg-line/60 motion-reduce:animate-none" />
        )}
      </p>
    </section>
  );
}

function feelWord(feels: number) {
  if (feels <= 0) return "Freezing";
  if (feels < 8) return "Cold";
  if (feels < 17) return "Mild";
  if (feels < 26) return "Warm";
  return "Hot";
}

/** "Freezing but dry in Brussels until noon." + "Power is cheapest tonight at 23:00, and the sky clears from 22:00." */
function briefing(today: TodayData, now: number): { lead: string; rest: string } | undefined {
  const { place, forecast, clouds, cheapest } = today;
  if (!place || (!forecast.data && !forecast.error)) return undefined;

  let lead = `Here's ${place.name} today.`;
  const first = forecast.data?.hours[0];
  if (first && forecast.data) {
    const wet = (q: { rain: number }) => q.rain >= 0.1;
    const quarters = forecast.data.quarters;
    const wetNow = first.rain >= 0.1 || (quarters[0] ? wet(quarters[0]) : false);
    const word = feelWord(first.feels);
    if (wetNow) {
      const stop = quarters.find((q) => !wet(q));
      lead = `${word} and wet in ${place.name}${stop ? `, drying up around ${stop.time.slice(11, 16)}` : ""}.`;
    } else {
      const start = quarters.find(wet);
      const cold = word === "Freezing" || word === "Cold";
      lead = `${word} ${cold ? "but" : "and"} dry in ${place.name}${start ? ` until ${start.time.slice(11, 16)}` : ""}.`;
    }
  }

  const parts: string[] = [];
  if (cheapest) {
    const h = new Date(cheapest.t).getHours();
    const sameDay = new Date(cheapest.t).toDateString() === new Date(now).toDateString();
    const when = !sameDay ? "tomorrow" : h >= 18 || h < 5 ? "tonight" : h < 12 ? "this morning" : "this afternoon";
    parts.push(`Power is cheapest ${when} at ${clock(cheapest.t)}`);
  }
  const night = place ? nightOf(now, new Observer(place.lat, place.lon, 0)) : undefined;
  const verdict = night && clouds.data ? cloudVerdict(night, clouds.data) : undefined;
  if (verdict) {
    parts.push(
      verdict.kind === "clear"
        ? "the sky stays clear all night"
        : verdict.kind === "cloudy"
          ? "it stays cloudy tonight"
          : `the sky clears from ${clock(verdict.from)}`,
    );
  }
  if (!parts.length) return { lead, rest: "" };
  const rest = parts.length === 2 ? `${parts[0]}, and ${parts[1]}.` : `${parts[0]}.`;
  return { lead, rest: rest[0].toUpperCase() + rest.slice(1) };
}

/* ------------------------------------------------------------------ the two weather tiles */

const VERDICT: Record<Level, { word: string; text: string; dot: string; bar: string }> = {
  0: { word: "Yes.", text: "text-good", dot: "bg-good-dot", bar: "bg-good-dot" },
  1: { word: "Yes, but…", text: "text-caution", dot: "bg-caution-dot", bar: "bg-caution-dot" },
  2: { word: "Better not.", text: "text-poor", dot: "bg-poor-dot", bar: "bg-poor-dot" },
};
const ACTIVITY_WORD: Record<Activity, string> = { bike: "cycling", run: "running", walk: "walking" };

export function GoingOutTile() {
  const { place, activity, forecast, air, now } = useToday();
  return (
    <Widget
      title="Going out"
      note={place ? `${place.name}, ${ACTIVITY_WORD[activity]}` : undefined}
      href="/apps/outside"
      className="flex-[7_1_520px]"
    >
      {forecast.error ? (
        <WidgetError>The forecast didn&apos;t load. Open the app to try again.</WidgetError>
      ) : !forecast.data || !place || !now ? (
        <Pulse />
      ) : (
        <GoingOutBody forecast={forecast.data} activity={activity} aqi={air.data?.now?.aqi} place={place} now={now} />
      )}
    </Widget>
  );
}

function GoingOutBody({
  forecast,
  activity,
  aqi,
  place,
  now,
}: {
  forecast: Forecast;
  activity: Activity;
  aqi?: number;
  place: Place;
  now: number;
}) {
  const first = forecast.hours[0];
  if (!first) return <WidgetError>No forecast for this hour yet.</WidgetError>;
  const darkAt = (t: number) => elevation(t, place.lat, place.lon) < -0.833;
  const nowHour = { ...first, aqi, dark: darkAt(now) };
  const { level, reasons } = rate(nowHour, activity);
  const v = VERDICT[level];
  const advice = tips(nowHour, activity)[0];
  const detail = [reasons[0] && reasons[0][0].toUpperCase() + reasons[0].slice(1) + ".", advice].filter(Boolean).join(" ");
  const next = forecast.hours.slice(0, 12).map((h) => {
    const t = toUnix(h.time, forecast.offset) + 30 * 60_000;
    return { h, level: rate({ ...h, dark: darkAt(t) }, activity).level };
  });
  const firstWet = forecast.quarters.find((q) => q.rain >= 0.1);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="min-w-0">
          <p className={`flex items-center gap-2.5 text-4xl font-semibold tracking-[-0.03em] sm:text-[40px] ${v.text}`}>
            <span aria-hidden className={`size-2.5 shrink-0 rounded-full ${v.dot}`} />
            {v.word}
          </p>
          {detail ? <p className="mt-2 max-w-md text-[15px] leading-normal text-muted">{detail}</p> : null}
        </div>
        <dl className="flex gap-7">
          <Stat label="Now" value={deg(first.temp)} />
          <Stat label="Feels like" value={deg(first.feels)} />
          <Stat label="Wind" value={`${Math.round(first.wind)} km/h`} />
        </dl>
      </div>
      <figure className="mt-auto pt-6">
        <figcaption className="mb-2.5 text-[13px] text-muted">
          Next 12 hours.{" "}
          {forecast.quarters.length
            ? firstWet
              ? `Rain from about ${firstWet.time.slice(11, 16)}.`
              : `Dry until at least ${forecast.quarters.at(-1)!.time.slice(11, 16)}.`
            : ""}
        </figcaption>
        <ol className="flex gap-1.5">
          {next.map(({ h, level }) => (
            <li key={h.time} className="flex min-w-0 flex-1 flex-col items-center gap-1.5 max-sm:even:hidden" title={`${h.time.slice(11, 16)}: ${VERDICT[level].word}`}>
              <span aria-hidden className={`h-1.5 w-full rounded-full ${VERDICT[level].bar}`} />
              <span className="text-sm font-medium">{deg(h.temp)}</span>
              <span className="text-xs text-muted">{h.time.slice(11, 13)}</span>
            </li>
          ))}
        </ol>
      </figure>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className="mt-0.5 text-[22px] font-medium tracking-[-0.02em] whitespace-nowrap">{value}</dd>
    </div>
  );
}

export function SkyTile() {
  const { place, clouds, now } = useToday();
  const night = useMemo(() => (place && now ? nightOf(now, new Observer(place.lat, place.lon, 0)) : undefined), [place, now]);
  return (
    <Widget
      title="Tonight's sky"
      note={night ? `Sunset ${clock(night.sunset)}, sunrise ${clock(night.sunrise)}` : undefined}
      href="/apps/sky"
      className="flex-[5_1_360px]"
    >
      {!place || !now ? (
        <Pulse />
      ) : !night ? (
        <WidgetError>The sun doesn&apos;t set here tonight.</WidgetError>
      ) : (
        <SkyBody place={place} night={night} now={now} clouds={clouds.data} error={!!clouds.error} />
      )}
    </Widget>
  );
}

function verdictWords(v: CloudVerdict) {
  if (v.kind === "clear") return "Clear all night";
  if (v.kind === "cloudy") return "Cloudy all night";
  return v.to ? `Clear from ${clock(v.from)} to ${clock(v.to)}` : `Clear from ${clock(v.from)}`;
}

function SkyBody({ place, night, now, clouds, error }: { place: Place; night: Night; now: number; clouds?: Cloud[]; error: boolean }) {
  const moon = moonInfo(now, night, new Observer(place.lat, place.lon, 0));
  const verdict = clouds ? cloudVerdict(night, clouds) : undefined;
  const hours = (clouds ?? []).filter((c) => c.t + 3_600_000 > night.sunset && c.t < night.sunrise);
  const spell =
    verdict?.kind === "spells"
      ? [hours.find((h) => h.t >= verdict.from), verdict.to ? hours.find((h) => h.t >= verdict.to!) : undefined]
      : [];
  // Ends of the night plus a clear spell's edges, left to right, skipping ones too close to a neighbour.
  const ends = [hours[0], hours.at(-1)].filter((m): m is Cloud => !!m);
  const middle = spell.filter(
    (m): m is Cloud => !!m && hours.indexOf(m) >= 3 && hours.length - 1 - hours.indexOf(m) >= 3,
  );
  const marks = ends.length === 2 ? [ends[0], ...middle, ends[1]] : ends;
  return (
    <>
      <div>
        <p className="text-[32px] leading-tight font-semibold tracking-[-0.03em]">
          {verdict ? verdictWords(verdict) : error ? "No cloud forecast right now" : <span className="text-muted">Checking the clouds…</span>}
        </p>
        <p className="mt-2.5 flex items-center gap-2.5 text-[15px] text-muted">
          <MoonIcon lit={moon.lit} waxing={moon.phase < 180} />
          {moon.name}, {Math.round(moon.lit * 100)}% lit
        </p>
      </div>
      {hours.length ? (
        <figure className="mt-auto pt-6">
          <figcaption className="mb-2.5 text-[13px] text-muted">Cloud cover through the night</figcaption>
          <div className="flex h-11 gap-[3px]">
            {hours.map((c) => (
              <span
                key={c.t}
                title={`${clock(c.t)}: ${Math.round(c.cover)}% cloud`}
                className="flex-1 rounded bg-muted"
                style={{ opacity: 0.1 + (c.cover / 100) * 0.75 }}
              />
            ))}
          </div>
          {/* Times under the strip: the ends, plus where a clear spell starts and stops. */}
          <div className="relative mt-2 h-4 text-xs text-muted">
            {marks.map((m, i) => {
              const at = hours.indexOf(m);
              const last = i === marks.length - 1;
              return (
                <span
                  key={m.t}
                  className="absolute whitespace-nowrap"
                  style={last ? { right: 0 } : { left: `${(at / hours.length) * 100}%` }}
                >
                  {clock(m.t)}
                </span>
              );
            })}
          </div>
        </figure>
      ) : null}
    </>
  );
}

/** The Moon's phase as a disc with the unlit part shaded. */
function MoonIcon({ lit, waxing }: { lit: number; waxing: boolean }) {
  // Terminator as an ellipse: x radius runs from 7 (new) through 0 (half) to 7 (full).
  const rx = Math.abs(1 - 2 * lit) * 7;
  const litSide = waxing ? 1 : 0; // 1 = right half lit
  const d =
    lit >= 0.99
      ? ""
      : `M9 2 A7 7 0 0 ${litSide ? 0 : 1} 9 16 A${rx} 7 0 0 ${lit > 0.5 ? litSide : 1 - litSide} 9 2 Z`;
  return (
    <svg viewBox="0 0 18 18" className="size-[18px] shrink-0" aria-hidden>
      <circle cx="9" cy="9" r="7" className="fill-foreground" />
      {d ? <path d={d} className="fill-line" /> : null}
      <circle cx="9" cy="9" r="7" fill="none" className="stroke-line" />
    </svg>
  );
}
