"use client";

import { Suspense, use, useCallback, useEffect, useMemo, useState } from "react";
import { PLACES, type Place } from "@/lib/bike";
import { loadSetting, saveSetting } from "@/lib/store";
import {
  bodyAt,
  type Cloud,
  cloudsUrl,
  cloudVerdict,
  parseClouds,
  COMPASS,
  COMPASS_WORDS,
  direction,
  FIGURES,
  issPasses,
  moonInfo,
  type MoonInfo,
  type Night,
  nightOf,
  observer,
  type Pass,
  type PlanetNight,
  planetsTonight,
  STARS,
  starAt,
  sunAlt,
  type Tle,
} from "@/lib/sky";
import { Body } from "astronomy-engine";

// The place is shared with "Should I go out?": pick it once, both apps use it.
const STORAGE_KEY = "bike-place";
const DEFAULT = PLACES.find((p) => p.name === "Brussels")!;
const ZONE = "Europe/Brussels";
const SLOT = 15 * 60_000;

const clock = (t: number) => new Date(t).toLocaleTimeString("en-GB", { timeZone: ZONE, hour: "2-digit", minute: "2-digit" });
const dateKey = (t: number) => new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(t);
const dayName = (t: number, now: number) => {
  const d = dateKey(t);
  if (d === dateKey(now)) return "Today";
  if (d === dateKey(now + 86_400_000)) return "Tomorrow";
  return new Date(t).toLocaleDateString("en-GB", { timeZone: ZONE, weekday: "long" });
};
const longDate = (t: number) =>
  new Date(t).toLocaleDateString("en-GB", { timeZone: ZONE, weekday: "short", day: "numeric", month: "short" });

const isPlace = (p: unknown): p is Place =>
  !!p && typeof (p as Place).name === "string" && Number.isFinite((p as Place).lat) && Number.isFinite((p as Place).lon);

/** The orbit arrives as a promise, so the page shows straight away and the passes stream in. */
export function SkyTonight({ tle }: { tle: Promise<Tle | undefined> }) {
  const [place, setPlace] = useState<Place>();
  const [now, setNow] = useState<number>();
  const [clouds, setClouds] = useState<Cloud[]>();
  const [cloudError, setCloudError] = useState(false);
  const [locating, setLocating] = useState(false);
  const [slot, setSlot] = useState<number>();

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- the saved place and the time only exist in the browser */
    setNow(Date.now());
    /* eslint-enable react-hooks/set-state-in-effect */
    let live = true;
    loadSetting(STORAGE_KEY, isPlace).then((saved) => {
      if (live) setPlace((cur) => cur ?? saved ?? DEFAULT);
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
    fetch(cloudsUrl(place.lat, place.lon), { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((raw) => {
        setClouds(parseClouds(raw));
        setCloudError(false);
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setCloudError(true);
      });
    return () => ctrl.abort();
  }, [place]);

  const choose = useCallback((p: Place) => {
    setPlace(p);
    setClouds(undefined);
    setSlot(undefined);
    saveSetting(STORAGE_KEY, p);
  }, []);

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

  // Everything about tonight, recalculated every ten minutes.
  const bucket = now ? Math.floor(now / 600_000) : undefined;
  const sky = useMemo(() => {
    if (!place || bucket === undefined) return undefined;
    const t = bucket * 600_000;
    const obs = observer(place.lat, place.lon);
    const night = nightOf(t, obs);
    if (!night) return undefined;
    return {
      obs,
      night,
      moon: moonInfo(t, night, obs),
      planets: planetsTonight(night, obs),
    };
  }, [place, bucket]);

  const slots = useMemo(() => {
    if (!sky) return [];
    const out: number[] = [];
    const start = Math.ceil(sky.night.sunset / SLOT) * SLOT;
    for (let t = start; t <= sky.night.sunrise; t += SLOT) out.push(t);
    return out;
  }, [sky]);

  // Start the chart at the current time during the night, otherwise when it gets properly dark.
  const defaultSlot = useMemo(() => {
    if (!sky || !now || !slots.length) return 0;
    const target =
      now > sky.night.sunset && now < sky.night.sunrise ? now : (sky.night.darkFrom ?? sky.night.sunset + 90 * 60_000);
    let best = 0;
    slots.forEach((t, i) => {
      if (Math.abs(t - target) < Math.abs(slots[best] - target)) best = i;
    });
    return best;
  }, [sky, now, slots]);
  const index = Math.min(slot ?? defaultSlot, Math.max(0, slots.length - 1));

  const named = place && PLACES.some((p) => p.name === place.name);

  return (
    <>
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">What&apos;s in the sky tonight?</h1>
      <p className="mt-4 max-w-xl text-lg leading-relaxed text-muted">
        Whether it will be clear, what the Moon is doing, which planets are up and when the space station flies over.
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-2 text-sm">
        <label htmlFor="sky-place" className="text-muted">
          Looking up from
        </label>
        <select
          id="sky-place"
          value={named ? place!.name : ""}
          onChange={(e) => {
            const p = PLACES.find((x) => x.name === e.target.value);
            if (p) choose(p);
          }}
          className="rounded-lg border border-line bg-surface px-3 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {place && !named ? <option value="">Your location</option> : null}
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

      {!sky || !now ? (
        <div className="mt-8 h-96 animate-pulse rounded-2xl bg-line/40 motion-reduce:animate-none" aria-label="Working out the sky" />
      ) : (
        <>
          <Verdict night={sky.night} clouds={clouds} error={cloudError} />

          <div className="mt-10 grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
            <section aria-labelledby="chart">
              <h2 id="chart" className="font-medium">
                The sky at {slots[index] ? clock(slots[index]) : "–"}
              </h2>
              <p className="mt-1 text-sm text-muted">Hold it above your head: north at the top, east on the left.</p>
              {slots.length ? (
                <>
                  <SkyChart t={slots[index]} sky={sky} />
                  <div className="mt-4 flex items-center gap-3 text-sm">
                    <span className="w-12 text-muted tabular-nums">{clock(slots[0])}</span>
                    <input
                      type="range"
                      min={0}
                      max={slots.length - 1}
                      value={index}
                      onChange={(e) => setSlot(Number(e.target.value))}
                      aria-label="Time of night"
                      aria-valuetext={clock(slots[index])}
                      className="sky-slider min-w-0 flex-1"
                    />
                    <span className="w-12 text-right text-muted tabular-nums">{clock(slots.at(-1)!)}</span>
                  </div>
                  {slot !== undefined ? (
                    <button
                      type="button"
                      onClick={() => setSlot(undefined)}
                      className="mt-2 text-sm text-accent outline-none hover:underline focus-visible:underline"
                    >
                      Back to {now > sky.night.sunset && now < sky.night.sunrise ? "now" : "nightfall"}
                    </button>
                  ) : null}
                </>
              ) : null}
            </section>

            <div className="space-y-10">
              <MoonPanel moon={sky.moon} now={now} />
              <PlanetList planets={sky.planets} />
            </div>
          </div>

          <IssPanel>
            <Suspense fallback={<p className="mt-4 text-sm text-muted">Loading the station&apos;s orbit…</p>}>
              <IssPasses tle={tle} place={place!} now={now} />
            </Suspense>
          </IssPanel>
        </>
      )}
    </>
  );
}

function Verdict({ night, clouds, error }: { night: Night; clouds?: Cloud[]; error: boolean }) {
  const hours = (clouds ?? []).filter((c) => c.t + 3_600_000 > night.sunset && c.t < night.sunrise);
  const verdict = clouds ? cloudVerdict(night, clouds) : undefined;
  const word = !verdict
    ? ""
    : verdict.kind === "clear"
      ? "Clear all night."
      : verdict.kind === "cloudy"
        ? "Cloudy all night."
        : verdict.to
          ? `Clear from ${clock(verdict.from)} to ${clock(verdict.to)}.`
          : `Clear from ${clock(verdict.from)}.`;
  const tone = !verdict
    ? ""
    : verdict.kind === "clear"
      ? "text-emerald-600 dark:text-emerald-400"
      : verdict.kind === "spells"
        ? "text-amber-600 dark:text-amber-400"
        : "text-rose-600 dark:text-rose-400";

  return (
    <div className="mt-8" aria-live="polite">
      {word ? (
        <p className={`text-5xl font-semibold tracking-tight sm:text-6xl ${tone}`}>{word}</p>
      ) : error ? (
        <p className="text-lg">The cloud forecast couldn&apos;t be loaded, but everything below still works.</p>
      ) : (
        <div className="h-14 w-72 animate-pulse rounded-lg bg-line/40 motion-reduce:animate-none" />
      )}
      <p className="mt-3 max-w-xl text-lg leading-relaxed">
        Sunset at {clock(night.sunset)}.{" "}
        {night.darkFrom && night.darkTo
          ? `Properly dark from ${clock(night.darkFrom)} to ${clock(night.darkTo)}.`
          : "It never gets fully dark tonight: the sun stays just below the horizon."}{" "}
        Sunrise at {clock(night.sunrise)}.
      </p>
      {hours.length ? (
        <div className="mt-6">
          <ol className="flex gap-0.5" aria-label="Cloud cover per hour tonight">
            {hours.map((c) => (
              <li key={c.t} className="min-w-0 flex-1 text-center">
                <span
                  className="block h-8 rounded-sm"
                  style={{ background: `color-mix(in oklab, var(--muted) ${Math.round(c.cover)}%, #4f46e5)` }}
                  title={`${clock(c.t)}: ${Math.round(c.cover)}% cloud`}
                  aria-label={`${clock(c.t)}: ${Math.round(c.cover)}% cloud`}
                />
                <span className="mt-1 block text-[10px] text-muted tabular-nums sm:text-xs">{clock(c.t).slice(0, 2)}</span>
              </li>
            ))}
          </ol>
          <p className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-[#4f46e5]" aria-hidden /> Clear
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-muted" aria-hidden /> Overcast
            </span>
          </p>
        </div>
      ) : null}
    </div>
  );
}

// ——— The sky chart ———

const R = 180;
const C = 200;
/** Altitude/azimuth → chart position: the zenith in the middle, the horizon on the edge, east on the left. */
function project(alt: number, az: number) {
  const r = ((90 - alt) / 90) * R;
  const a = (az * Math.PI) / 180;
  return { x: C - r * Math.sin(a), y: C - r * Math.cos(a) };
}

function skyColour(sun: number) {
  if (sun > -6) return ["#334e7a", "#1e3358"];
  if (sun > -12) return ["#1f2f57", "#121c3a"];
  if (sun > -18) return ["#141d3d", "#0b1128"];
  return ["#0c1230", "#05081a"];
}

type SkyData = { obs: ReturnType<typeof observer>; night: Night; moon: MoonInfo; planets: PlanetNight[] };

function SkyChart({ t, sky }: { t: number; sky: SkyData }) {
  const { obs } = sky;
  const sun = sunAlt(t, obs);
  const [inner, outer] = skyColour(sun);
  // In twilight only the brightest stars show.
  const limit = sun > -6 ? -1 : sun > -12 ? 1 : 3.5;
  const stars = Object.keys(STARS)
    .map((name) => ({ name, ...STARS[name], ...starAt(name, t, obs) }))
    .filter((s) => s.alt > 0 && s.mag <= limit);
  const pos = Object.fromEntries(stars.map((s) => [s.name, project(s.alt, s.az)]));
  // A pattern is only drawn when all of its stars are up and visible.
  const figures = FIGURES.filter((f) => f.lines.flat().every((n) => pos[n]));
  const moon = bodyAt(Body.Moon, t, obs);
  const planets = sky.planets.map((p) => ({ ...p, ...bodyAt(p.body, t, obs) })).filter((p) => p.alt > 0);

  return (
    <svg viewBox="0 0 400 400" className="mt-4 block w-full max-w-xl" role="img" aria-label={describe(stars, planets, moon)}>
      <defs>
        <radialGradient id="sky-bg">
          <stop offset="0%" stopColor={inner} />
          <stop offset="100%" stopColor={outer} />
        </radialGradient>
        <clipPath id="sky-clip">
          <circle cx={C} cy={C} r={R} />
        </clipPath>
      </defs>
      <circle cx={C} cy={C} r={R} fill="url(#sky-bg)" />
      <g clipPath="url(#sky-clip)" fill="none" stroke="#c7d2fe" strokeOpacity=".12">
        <circle cx={C} cy={C} r={R / 3} strokeDasharray="2 4" />
        <circle cx={C} cy={C} r={(R * 2) / 3} strokeDasharray="2 4" />
        <line x1={C} y1={C - R} x2={C} y2={C + R} strokeDasharray="2 4" />
        <line x1={C - R} y1={C} x2={C + R} y2={C} strokeDasharray="2 4" />
        {figures.flatMap((f) =>
          f.lines.map(([a, b]) => (
              <line key={`${a}-${b}`} x1={pos[a].x} y1={pos[a].y} x2={pos[b].x} y2={pos[b].y} stroke="#a5b4fc" strokeOpacity=".35" />
            )),
        )}
      </g>
      {figures.map((f) => {
        const pts = [...new Set(f.lines.flat())].map((n) => pos[n]);
        const x = pts.reduce((a, p) => a + p.x, 0) / pts.length;
        const y = Math.max(...pts.map((p) => p.y)) + 14;
        return (
          <text key={f.name} x={x} y={Math.min(y, C + R - 6)} fill="#a5b4fc" fillOpacity=".7" fontSize="9" textAnchor="middle">
            {f.name}
          </text>
        );
      })}
      {stars.map((s) => {
        const p = pos[s.name];
        const label = s.mag < 0.9 || s.name === "Polaris" || s.name === "Pleiades";
        return (
          <g key={s.name}>
            {s.name === "Pleiades" ? (
              <g fill="#e0e7ff">
                <circle cx={p.x - 2} cy={p.y - 1} r={0.9} />
                <circle cx={p.x + 1.5} cy={p.y - 2} r={0.9} />
                <circle cx={p.x} cy={p.y + 1} r={1.1} />
                <circle cx={p.x + 2.5} cy={p.y + 1.5} r={0.8} />
              </g>
            ) : (
              <circle cx={p.x} cy={p.y} r={Math.max(0.9, 2.8 - s.mag * 0.6)} fill="#f1f5ff" />
            )}
            {label ? (
              <text x={p.x + 5} y={p.y + 3} fill="#c7d2fe" fillOpacity=".75" fontSize="8.5">
                {s.name}
              </text>
            ) : null}
          </g>
        );
      })}
      {planets.map((p) => {
        const q = project(p.alt, p.az);
        return (
          <g key={p.name}>
            <circle cx={q.x} cy={q.y} r={3.6} fill={p.colour} />
            <text x={q.x + 6} y={q.y + 3.5} fill={p.colour} fontSize="10" fontWeight="600">
              {p.name}
            </text>
          </g>
        );
      })}
      {moon.alt > 0
        ? (() => {
            const q = project(moon.alt, moon.az);
            return (
              <g>
                <MoonShape cx={q.x} cy={q.y} r={8} phase={sky.moon.phase} dark="#0b1128" />
                <text x={q.x + 11} y={q.y + 3.5} fill="#fef9c3" fontSize="10" fontWeight="600">
                  Moon
                </text>
              </g>
            );
          })()
        : null}
      <circle cx={C} cy={C} r={R} fill="none" className="stroke-line" strokeWidth="2" />
      {[
        ["N", C, C - R - 8],
        ["S", C, C + R + 16],
        ["E", C - R - 12, C + 4],
        ["W", C + R + 12, C + 4],
      ].map(([l, x, y]) => (
        <text key={l as string} x={x as number} y={y as number} textAnchor="middle" fontSize="12" fontWeight="600" className="fill-muted">
          {l}
        </text>
      ))}
    </svg>
  );
}

function describe(stars: { name: string }[], planets: { name: string; alt: number; az: number }[], moon: { alt: number; az: number }) {
  const parts = planets.map((p) => `${p.name} in the ${COMPASS_WORDS[direction(p.az)]}, ${Math.round(p.alt)}° up`);
  if (moon.alt > 0) parts.unshift(`the Moon in the ${COMPASS_WORDS[direction(moon.az)]}, ${Math.round(moon.alt)}° up`);
  return `Sky chart. ${parts.length ? `Visible: ${parts.join("; ")}.` : "No planets or Moon above the horizon."} ${stars.length} bright stars shown.`;
}

/** A moon with the right phase. Lit on the right while waxing, as seen from the northern hemisphere. */
function MoonShape({ cx, cy, r, phase, dark }: { cx: number; cy: number; r: number; phase: number; dark: string }) {
  const k = (1 - Math.cos((phase * Math.PI) / 180)) / 2;
  const waxing = phase < 180;
  const rx = Math.abs(1 - 2 * k) * r;
  const outer = waxing ? 1 : 0;
  const inner = waxing ? (k < 0.5 ? 0 : 1) : k < 0.5 ? 1 : 0;
  const d = `M ${cx} ${cy - r} A ${r} ${r} 0 0 ${outer} ${cx} ${cy + r} A ${rx} ${r} 0 0 ${inner} ${cx} ${cy - r} Z`;
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={dark} stroke="#fef9c3" strokeOpacity=".35" strokeWidth={r / 16} />
      {k > 0.01 ? <path d={d} fill="#fef9c3" /> : null}
    </g>
  );
}

// ——— Side panels ———

function MoonPanel({ moon, now }: { moon: MoonInfo; now: number }) {
  const waxing = moon.phase < 180;
  const next = waxing ? moon.nextFull : moon.nextNew;
  return (
    <section aria-labelledby="moon">
      <h2 id="moon" className="font-medium">
        The Moon
      </h2>
      <div className="mt-3 flex items-center gap-4">
        <svg viewBox="0 0 64 64" className="size-16 shrink-0" aria-hidden>
          <MoonShape cx={32} cy={32} r={28} phase={moon.phase} dark="var(--line)" />
        </svg>
        <div>
          <p className="text-lg font-medium">{moon.name}</p>
          <p className="text-sm text-muted">{Math.round(moon.lit * 100)}% lit</p>
        </div>
      </div>
      <dl className="mt-4 space-y-1.5 text-sm">
        {moon.rise ? (
          <div className="flex justify-between gap-4 border-b border-line pb-1.5">
            <dt className="text-muted">Moonrise</dt>
            <dd className="tabular-nums">
              {dayName(moon.rise, now)} {clock(moon.rise)}
            </dd>
          </div>
        ) : null}
        {moon.set ? (
          <div className="flex justify-between gap-4 border-b border-line pb-1.5">
            <dt className="text-muted">Moonset</dt>
            <dd className="tabular-nums">
              {dayName(moon.set, now)} {clock(moon.set)}
            </dd>
          </div>
        ) : null}
        {next ? (
          <div className="flex justify-between gap-4 border-b border-line pb-1.5">
            <dt className="text-muted">{waxing ? "Next full moon" : "Next new moon"}</dt>
            <dd>{longDate(next)}</dd>
          </div>
        ) : null}
      </dl>
      {moon.lit > 0.75 ? (
        <p className="mt-3 text-sm text-muted">A bright moon washes out faint stars. Planets still shine through.</p>
      ) : moon.lit < 0.15 ? (
        <p className="mt-3 text-sm text-muted">Hardly any moonlight: a good night for faint stars.</p>
      ) : null}
    </section>
  );
}

function brightness(mag: number) {
  if (mag < -3) return "very bright";
  if (mag < 0) return "bright";
  if (mag < 1.5) return "easy to see";
  return "faint";
}

function PlanetList({ planets }: { planets: PlanetNight[] }) {
  const up = planets.filter((p) => p.from !== undefined).sort((a, b) => a.from! - b.from!);
  const down = planets.filter((p) => p.from === undefined);
  return (
    <section aria-labelledby="planets">
      <h2 id="planets" className="font-medium">
        Planets
      </h2>
      {up.length ? (
        <ul className="mt-3 space-y-3">
          {up.map((p) => (
            <li key={p.name} className="flex gap-3">
              <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: p.colour }} aria-hidden />
              <div>
                <p className="font-medium">
                  {p.name} <span className="font-normal text-muted">({brightness(p.mag)})</span>
                </p>
                <p className="text-sm text-muted">
                  {p.from === p.to
                    ? `Briefly at ${clock(p.from!)}, low in the ${COMPASS_WORDS[direction(p.bestAz!)]}.`
                    : `${clock(p.from!)} to ${clock(p.to!)}, highest at ${clock(p.best!)} in the ${COMPASS_WORDS[direction(p.bestAz!)]} (${Math.round(p.bestAlt!)}° up).`}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted">No bright planets are up while it&apos;s dark tonight.</p>
      )}
      {down.length ? (
        <p className="mt-3 text-sm text-muted">
          Not visible tonight: {new Intl.ListFormat("en-GB").format(down.map((p) => p.name))}. Below the horizon or too
          close to the sun.
        </p>
      ) : null}
    </section>
  );
}

function IssPasses({ tle: pending, place, now }: { tle: Promise<Tle | undefined>; place: Place; now: number }) {
  const tle = use(pending);
  const hour = Math.floor(now / 3_600_000);
  const passes = useMemo(() => {
    if (!tle) return undefined;
    const from = hour * 3_600_000;
    return issPasses(tle, from, 4, place.lat, place.lon, observer(place.lat, place.lon)).filter((p) => p.end > now).slice(0, 6);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recalculated once an hour, not every minute
  }, [tle, place, hour]);
  return <PassList passes={passes} now={now} />;
}

function IssPanel({ children }: { children: React.ReactNode }) {
  return (
    <section aria-labelledby="iss" className="mt-12 border-t border-line pt-10">
      <h2 id="iss" className="font-medium">
        Space station passes
      </h2>
      <p className="mt-1 max-w-xl text-sm text-muted">
        The ISS looks like a bright star moving steadily across the sky, no blinking. You can only see it when it&apos;s
        lit by the sun and your sky is dark: around dusk and dawn.
      </p>
      {children}
    </section>
  );
}

function PassList({ passes, now }: { passes?: Pass[]; now: number }) {
  return (
    <>
      {!passes ? (
        <p className="mt-4 text-sm">The station&apos;s orbit couldn&apos;t be loaded right now. Try again later.</p>
      ) : passes.length ? (
        <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {passes.map((p) => {
            const mins = Math.max(1, Math.round((p.end - p.start) / 60_000));
            return (
              <li key={p.start} className="panel p-4">
                <p className="text-sm text-muted">{dayName(p.start, now)}</p>
                <p className="mt-0.5 text-2xl font-semibold tracking-tight tabular-nums">{clock(p.start)}</p>
                <p className="mt-2 text-sm">
                  {mins} min,{" "}
                  {direction(p.startAz) === direction(p.endAz)
                    ? `low in the ${COMPASS[direction(p.startAz)]}`
                    : `from the ${COMPASS[direction(p.startAz)]} to the ${COMPASS[direction(p.endAz)]}`}
                  , up to {Math.round(p.maxAlt)}°{p.maxAlt > 60 ? ", almost overhead" : ""}.
                </p>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="mt-4 text-sm">No visible passes in the next four days. It goes through phases: check back in a week.</p>
      )}
    </>
  );
}
