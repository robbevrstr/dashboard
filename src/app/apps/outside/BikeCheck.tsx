"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type Activity,
  ACTIVITIES,
  type Air,
  airUrl,
  aqiBand,
  compass,
  type Forecast,
  forecastUrl,
  type Level,
  mm,
  parseAir,
  parseForecast,
  PLACES,
  type Place,
  rainNote,
  rate,
  tips,
  toUnix,
} from "@/lib/bike";
import { tellSaucer } from "@/lib/saucer";
import { loadSetting, saveSetting } from "@/lib/store";
import { addDays, daysBetween, elevation, nextSolstice, sunDay } from "@/lib/sun";

const STORAGE_KEY = "bike-place";
const ACTIVITY_KEY = "bike-activity";
const DEFAULT = PLACES.find((p) => p.name === "Brussels")!;
const ZONE = "Europe/Brussels";

const VERDICT: Record<Level, { word: string; text: string; bar: string; dot: string }> = {
  0: { word: "Yes.", text: "text-emerald-600 dark:text-emerald-400", bar: "bg-emerald-500", dot: "bg-emerald-500" },
  1: { word: "Yes, but…", text: "text-amber-600 dark:text-amber-400", bar: "bg-amber-400", dot: "bg-amber-400" },
  2: { word: "Better not.", text: "text-rose-600 dark:text-rose-400", bar: "bg-rose-500", dot: "bg-rose-500" },
};
const LEGEND: Record<Level, string> = { 0: "Good to go", 1: "Go, but be ready", 2: "Better not" };
const LEAVING: Record<Activity, string> = { bike: "Leaving", run: "Running", walk: "Walking" };

const isPlace = (p: unknown): p is Place =>
  !!p && typeof (p as Place).name === "string" && Number.isFinite((p as Place).lat) && Number.isFinite((p as Place).lon);
const isActivity = (a: unknown): a is Activity => ACTIVITIES.includes(a as Activity);

const hourOf = (time: string) => time.slice(11, 16);
const deg = (v: number) => `${Math.round(v)}°`;
const clock = (t: number) => new Date(t).toLocaleTimeString("en-GB", { timeZone: ZONE, hour: "2-digit", minute: "2-digit" });
const dateKey = (t: number) => new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(t);
const duration = (min: number) => `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, "0")} min`;

export function BikeCheck() {
  const [place, setPlace] = useState<Place>();
  const [activity, setActivity] = useState<Activity>("bike");
  /** Set once you choose an activity, so a slow load doesn't undo your choice. */
  const picked = useRef(false);
  const [forecast, setForecast] = useState<Forecast>();
  const [air, setAir] = useState<Air>();
  const [error, setError] = useState<string>();
  const [selected, setSelected] = useState(0);
  const [locating, setLocating] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [now, setNow] = useState<number>();

  useEffect(() => {
    // The current time only exists in the browser; the saved choices come from the server.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now());
    let live = true;
    Promise.all([loadSetting(STORAGE_KEY, isPlace), loadSetting(ACTIVITY_KEY, isActivity)]).then(([p, a]) => {
      if (!live) return;
      setPlace((cur) => cur ?? p ?? DEFAULT);
      if (a && !picked.current) setActivity(a);
    });
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!place) return;
    const ctrl = new AbortController();
    const get = (url: string) =>
      fetch(url, { signal: ctrl.signal }).then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      });
    get(forecastUrl(place.lat, place.lon))
      .then((raw) => {
        setForecast(parseForecast(raw));
        setError(undefined);
        setSelected(0);
      })
      .catch((e) => {
        if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : "failed");
      });
    // Air quality is a bonus: if it fails, the verdict just leaves it out.
    get(airUrl(place.lat, place.lon))
      .then((raw) => setAir(parseAir(raw)))
      .catch(() => {
        if (!ctrl.signal.aborted) setAir(undefined);
      });
    return () => ctrl.abort();
  }, [place, attempt]);

  const choose = useCallback((p: Place) => {
    setPlace(p);
    setForecast(undefined);
    setAir(undefined);
    saveSetting(STORAGE_KEY, p);
  }, []);

  const pick = (a: Activity) => {
    picked.current = true;
    setActivity(a);
    saveSetting(ACTIVITY_KEY, a);
  };

  const locate = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        choose({ name: "your location", lat: pos.coords.latitude, lon: pos.coords.longitude });
      },
      () => setLocating(false),
      { timeout: 10000, maximumAge: 10 * 60 * 1000 },
    );
  };

  const hours = (forecast?.hours ?? []).map((h, i) => {
    // "Now" uses the actual time; later hours are judged at half past.
    const t = i === 0 && now ? now : toUnix(h.time, forecast!.offset) + 30 * 60_000;
    return {
      ...h,
      aqi: i === 0 && air?.now ? air.now.aqi : air?.aqi[h.time],
      dark: place ? elevation(t, place.lat, place.lon) < -0.833 : false,
    };
  });
  const rated = hours.map((h) => ({ h, ...rate(h, activity) }));

  // Tell the saucer whether it is raining (or snowing) and dark right now.
  const nowWet = hours[0] ? hours[0].rain >= 0.1 || hours[0].code >= 51 : undefined;
  const nowDark = hours[0]?.dark;
  useEffect(() => {
    if (nowWet === undefined || nowDark === undefined) return;
    tellSaucer({ kind: "weather", rain: nowWet, dark: nowDark });
  }, [nowWet, nowDark, place]);
  const current = rated[selected];
  const better = current?.level ? rated.findIndex((r, i) => i > selected && r.level < current.level) : -1;
  const advice = current ? tips(current.h, activity) : [];

  return (
    <>
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
        Should I {activity}?
      </h1>
      <p className="mt-4 max-w-xl text-lg leading-relaxed text-muted">
        A straight answer from the forecast for rain, wind, cold and air quality, for now and the next twelve hours.
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-3 text-sm">
        <div className="flex rounded-lg border border-line p-0.5" role="group" aria-label="Activity">
          {ACTIVITIES.map((a) => (
            <button
              key={a}
              type="button"
              aria-pressed={activity === a}
              onClick={() => pick(a)}
              className={`rounded-md px-3 py-1 capitalize outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                activity === a ? "bg-foreground text-background" : "text-muted hover:text-foreground"
              }`}
            >
              {a}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="place" className="text-muted">
            in
          </label>
          <select
            id="place"
            value={place && PLACES.some((p) => p.name === place.name) ? place.name : ""}
            onChange={(e) => {
              const p = PLACES.find((x) => x.name === e.target.value);
              if (p) choose(p);
            }}
            className="rounded-lg border border-line bg-surface px-3 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {place && !PLACES.some((p) => p.name === place.name) ? <option value="">Your location</option> : null}
            {PLACES.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={locate}
            disabled={locating}
            className="rounded-lg border border-line px-3 py-1.5 outline-none hover:border-foreground focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60"
          >
            {locating ? "Finding you…" : "Use my location"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-8 rounded-lg border border-red-500/30 bg-red-500/5 p-4 text-sm">
          The forecast couldn&apos;t be loaded.{" "}
          <button type="button" onClick={() => setAttempt((a) => a + 1)} className="font-medium underline underline-offset-4">
            Try again
          </button>
        </div>
      ) : !current || !place || !now ? (
        <div className="mt-8 h-72 animate-pulse rounded-2xl bg-line/40 motion-reduce:animate-none" aria-label="Loading forecast" />
      ) : (
        <>
          <div className="mt-8" aria-live="polite">
            <p className="text-sm text-muted">
              {selected === 0 ? "Right now" : `${LEAVING[activity]} at ${hourOf(current.h.time)}`} in{" "}
              {PLACES.some((p) => p.name === place.name) ? place.name : "your location"}
            </p>
            <p className={`mt-1 text-6xl font-semibold tracking-tight sm:text-7xl ${VERDICT[current.level].text}`}>
              {VERDICT[current.level].word}
            </p>
            <p className="mt-3 max-w-xl text-lg leading-relaxed">
              {current.level === 0
                ? `${selected === 0 ? "" : "Dry, "}${deg(current.h.temp)} and ${current.h.wind < 15 ? "hardly any wind" : `wind from the ${compass(current.h.windFrom)}`}.`
                : `Expect ${new Intl.ListFormat("en-GB").format(current.reasons)}.`}
              {advice.length ? ` ${advice.join(" ")}` : ""}
              {selected === 0 && forecast ? ` ${rainNote(forecast.quarters) ?? ""}` : ""}
            </p>
            {better > 0 ? (
              <p className="mt-2 text-muted">
                Better at{" "}
                <button
                  type="button"
                  onClick={() => setSelected(better)}
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  {hourOf(rated[better].h.time)}
                </button>
                .
              </p>
            ) : null}
          </div>

          <dl className="mt-8 grid max-w-xl grid-cols-3 gap-4 border-y border-line py-4 text-sm">
            <div>
              <dt className="text-muted">Temperature</dt>
              <dd className="mt-1 text-lg font-medium tabular-nums">{deg(current.h.temp)}</dd>
              <dd className="text-muted">feels {deg(current.h.feels)}</dd>
            </div>
            <div>
              <dt className="text-muted">Rain</dt>
              <dd className="mt-1 text-lg font-medium tabular-nums">{mm(current.h.rain)}</dd>
              <dd className="text-muted">{current.h.chance}% chance</dd>
            </div>
            <div>
              <dt className="text-muted">Wind</dt>
              <dd className="mt-1 text-lg font-medium tabular-nums">{Math.round(current.h.wind)} km/h</dd>
              <dd className="text-muted">gusts {Math.round(current.h.gusts)}</dd>
            </div>
          </dl>

          <section aria-labelledby="hours" className="mt-10">
            <h2 id="hours" className="font-medium">
              The next 12 hours
            </h2>
            <div className="-mx-4 mt-4 overflow-x-auto px-4 pb-2">
              <ol className="grid min-w-[560px] grid-cols-13 gap-1.5">
                {rated.map((r, i) => {
                  const on = i === selected;
                  return (
                    <li key={r.h.time}>
                      <button
                        type="button"
                        aria-pressed={on}
                        aria-label={`${i === 0 ? "Now" : hourOf(r.h.time)}: ${LEGEND[r.level]}${r.h.dark ? ", dark" : ""}`}
                        onClick={() => setSelected(i)}
                        className={`flex w-full flex-col items-center gap-1.5 rounded-lg px-0.5 py-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                          on ? "bg-surface ring-1 ring-foreground/30" : "hover:bg-surface"
                        }`}
                      >
                        <span className={on ? "font-medium" : "text-muted"}>{i === 0 ? "Now" : hourOf(r.h.time).slice(0, 2)}</span>
                        <span className={`h-12 w-full max-w-8 rounded-md ${VERDICT[r.level].bar}`} aria-hidden />
                        <span
                          className={`h-1 w-full max-w-8 rounded-full ${r.h.dark ? "bg-slate-700 dark:bg-slate-300" : "bg-transparent"}`}
                          aria-hidden
                        />
                        <span className="tabular-nums">{deg(r.h.temp)}</span>
                        <span className="tabular-nums text-sky-600 dark:text-sky-400">
                          {r.h.rain >= 0.1 ? r.h.rain.toFixed(1) : " "}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
            <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
              {([0, 1, 2] as Level[]).map((l) => (
                <li key={l} className="flex items-center gap-1.5">
                  <span className={`size-2 rounded-full ${VERDICT[l].dot}`} aria-hidden />
                  {LEGEND[l]}
                </li>
              ))}
              <li className="flex items-center gap-1.5">
                <span className="h-1 w-3 rounded-full bg-slate-700 dark:bg-slate-300" aria-hidden />
                Dark
              </li>
              <li>
                <span className="text-sky-600 dark:text-sky-400">Blue numbers</span>: rain in mm
              </li>
            </ul>
          </section>

          <div className="mt-12 grid gap-10 md:grid-cols-2 md:gap-12">
            <Daylight place={place} now={now} />
            <AirPanel air={air} />
          </div>
        </>
      )}
    </>
  );
}

function Daylight({ place, now }: { place: Place; now: number }) {
  const today = dateKey(now);
  const sun = sunDay(today, place.lat, place.lon);
  const yesterday = sunDay(addDays(today, -1), place.lat, place.lon);
  if (!sun) return null;
  const solstice = nextSolstice(today);
  const days = daysBetween(today, solstice.date);
  const diff = yesterday ? (sun.length - yesterday.length) * 60 : 0; // seconds
  const diffText =
    Math.abs(diff) < 30
      ? "about as long as yesterday"
      : `${Math.floor(Math.abs(diff) / 60)} min ${String(Math.round(Math.abs(diff) % 60)).padStart(2, "0")} s ${diff < 0 ? "shorter" : "longer"} than yesterday`;
  const up = now >= sun.sunrise && now < sun.sunset;
  // How far through the day the sun is, for the little arc.
  const progress = Math.min(1, Math.max(0, (now - sun.sunrise) / (sun.sunset - sun.sunrise)));

  return (
    <section aria-labelledby="daylight">
      <h2 id="daylight" className="text-xl font-semibold tracking-tight">
        Daylight
      </h2>
      <SunArc progress={progress} up={up} />
      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
        <div>
          <dt className="text-muted">Sunrise</dt>
          <dd className="mt-0.5 text-lg font-medium tabular-nums">{clock(sun.sunrise)}</dd>
        </div>
        <div>
          <dt className="text-muted">Sunset</dt>
          <dd className="mt-0.5 text-lg font-medium tabular-nums">{clock(sun.sunset)}</dd>
        </div>
        {sun.goldenEveningStart ? (
          <div>
            <dt className="text-muted">Golden hour</dt>
            <dd className="mt-0.5 tabular-nums">from {clock(sun.goldenEveningStart)}</dd>
          </div>
        ) : null}
        {sun.dusk ? (
          <div>
            <dt className="text-muted">Fully dark</dt>
            <dd className="mt-0.5 tabular-nums">from {clock(sun.dusk)}</dd>
          </div>
        ) : null}
      </dl>
      <p className="mt-4 text-sm leading-relaxed text-muted">
        <span className="text-foreground">{duration(sun.length)}</span> of daylight today, {diffText}.{" "}
        {days === 0
          ? `Today is the ${solstice.shortest ? "shortest" : "longest"} day.`
          : `${days} ${days === 1 ? "day" : "days"} until the ${solstice.shortest ? "shortest" : "longest"} day${
              solstice.shortest ? ", then they get longer again" : ""
            }.`}
      </p>
    </section>
  );
}

/** A half-circle from sunrise to sunset with the sun's place on it. */
function SunArc({ progress, up }: { progress: number; up: boolean }) {
  const w = 240;
  const r = 100;
  const cx = w / 2;
  const cy = 112;
  const a = Math.PI * (1 - progress);
  const sx = cx + r * Math.cos(a);
  const sy = cy - r * Math.sin(a);
  return (
    <svg viewBox={`0 0 ${w} 124`} className="mt-4 w-full max-w-60" aria-hidden>
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" className="stroke-line" strokeWidth={2} strokeDasharray="3 5" />
      {up ? (
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${sx} ${sy}`}
          fill="none"
          className="stroke-amber-400"
          strokeWidth={2.5}
          strokeLinecap="round"
        />
      ) : null}
      <line x1={4} x2={w - 4} y1={cy} y2={cy} className="stroke-line" strokeWidth={1.5} />
      {up ? <circle cx={sx} cy={sy} r={9} className="fill-amber-400" /> : null}
    </svg>
  );
}

const POLLEN_WORD = ["low", "moderate", "high"] as const;

function AirPanel({ air }: { air?: Air }) {
  if (!air?.now) {
    return (
      <section aria-labelledby="air">
        <h2 id="air" className="text-xl font-semibold tracking-tight">
          Air and pollen
        </h2>
        <p className="mt-4 text-sm text-muted">{air ? "No air quality data for this place right now." : "Loading…"}</p>
      </section>
    );
  }
  const { aqi, pm25, pm10, no2, o3 } = air.now;
  const band = aqiBand(aqi);
  const tone =
    aqi < 40 ? "text-emerald-600 dark:text-emerald-400" : aqi < 60 ? "text-amber-600 dark:text-amber-400" : "text-rose-600 dark:text-rose-400";
  const inAir = air.pollen.filter((p) => p.level > 0).sort((a, b) => b.value - a.value);
  const ug = (v: number) => (Number.isFinite(v) ? `${Math.round(v)} µg/m³` : "–");

  return (
    <section aria-labelledby="air">
      <h2 id="air" className="text-xl font-semibold tracking-tight">
        Air and pollen
      </h2>
      <p className="mt-4 text-sm text-muted">Air quality right now</p>
      <p className={`mt-0.5 text-3xl font-semibold tracking-tight capitalize ${tone}`}>{band}</p>
      <p className="mt-1 text-sm text-muted tabular-nums">European index {Math.round(aqi)}</p>
      <dl className="mt-4 grid max-w-sm gap-y-2 text-sm">
        {[
          ["Fine dust (PM2.5)", pm25],
          ["Dust (PM10)", pm10],
          ["Nitrogen dioxide", no2],
          ["Ozone", o3],
        ].map(([label, v]) => (
          <div key={label as string} className="flex justify-between gap-2 border-b border-line pb-1.5">
            <dt className="text-muted">{label}</dt>
            <dd className="tabular-nums">{ug(v as number)}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-5 text-sm leading-relaxed">
        {inAir.length ? (
          <>
            Pollen in the next 12 hours:{" "}
            {new Intl.ListFormat("en-GB").format(inAir.map((p) => `${p.name.toLowerCase()} (${POLLEN_WORD[p.level]})`))}.
            {inAir.some((p) => p.level === 2) ? " Enough to bother anyone with hay fever." : ""}
          </>
        ) : (
          <span className="text-muted">Hardly any pollen in the air over the next 12 hours.</span>
        )}
      </p>
    </section>
  );
}
