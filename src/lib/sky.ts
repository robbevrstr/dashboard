// The sky tonight, worked out in the browser: darkness, the Moon, the planets, bright stars and ISS passes.
// Positions come from astronomy-engine; the ISS orbit from satellite.js with a CelesTrak TLE.

const EARTH_RADIUS = 6371; // km

/** Is a point (km, Earth-centred equatorial) in Earth's shadow? A cylinder is close enough for the ISS. */
function inShadow(p: { x: number; y: number; z: number }, t: Date) {
  const sun = GeoVector(Body.Sun, t, false);
  const len = Math.hypot(sun.x, sun.y, sun.z);
  const [ux, uy, uz] = [sun.x / len, sun.y / len, sun.z / len];
  const along = p.x * ux + p.y * uy + p.z * uz;
  if (along > 0) return false;
  return Math.hypot(p.x - along * ux, p.y - along * uy, p.z - along * uz) < EARTH_RADIUS;
}

import {
  Body,
  Equator,
  GeoVector,
  Horizon,
  Illumination,
  MoonPhase,
  Observer,
  SearchAltitude,
  SearchMoonPhase,
  SearchRiseSet,
} from "astronomy-engine";
import { degreesToRadians, ecfToLookAngles, eciToEcf, gstime, propagate, twoline2satrec } from "satellite.js";

export type Tle = { name: string; line1: string; line2: string };
export type AltAz = { alt: number; az: number };

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const STEP = 10 * 60_000;

export const PLANETS = [
  { body: Body.Mercury, name: "Mercury", colour: "#d6d3d1" },
  { body: Body.Venus, name: "Venus", colour: "#fef3c7" },
  { body: Body.Mars, name: "Mars", colour: "#fb923c" },
  { body: Body.Jupiter, name: "Jupiter", colour: "#fde68a" },
  { body: Body.Saturn, name: "Saturn", colour: "#fcd34d" },
] as const;

/** Bright stars, J2000 right ascension in hours and declination in degrees. */
export const STARS: Record<string, { ra: number; dec: number; mag: number }> = {
  Sirius: { ra: 6.752, dec: -16.72, mag: -1.46 },
  Arcturus: { ra: 14.261, dec: 19.18, mag: -0.05 },
  Vega: { ra: 18.616, dec: 38.78, mag: 0.03 },
  Capella: { ra: 5.278, dec: 46.0, mag: 0.08 },
  Rigel: { ra: 5.242, dec: -8.2, mag: 0.13 },
  Procyon: { ra: 7.655, dec: 5.22, mag: 0.34 },
  Betelgeuse: { ra: 5.919, dec: 7.41, mag: 0.5 },
  Altair: { ra: 19.846, dec: 8.87, mag: 0.77 },
  Aldebaran: { ra: 4.599, dec: 16.51, mag: 0.85 },
  Antares: { ra: 16.49, dec: -26.43, mag: 0.96 },
  Spica: { ra: 13.42, dec: -11.16, mag: 0.97 },
  Pollux: { ra: 7.755, dec: 28.03, mag: 1.14 },
  Fomalhaut: { ra: 22.961, dec: -29.62, mag: 1.16 },
  Deneb: { ra: 20.69, dec: 45.28, mag: 1.25 },
  Regulus: { ra: 10.14, dec: 11.97, mag: 1.35 },
  Castor: { ra: 7.577, dec: 31.89, mag: 1.58 },
  Bellatrix: { ra: 5.419, dec: 6.35, mag: 1.64 },
  Alnilam: { ra: 5.604, dec: -1.2, mag: 1.69 },
  Alnitak: { ra: 5.679, dec: -1.94, mag: 1.77 },
  Alioth: { ra: 12.9, dec: 55.96, mag: 1.77 },
  Dubhe: { ra: 11.062, dec: 61.75, mag: 1.79 },
  Alkaid: { ra: 13.792, dec: 49.31, mag: 1.86 },
  Polaris: { ra: 2.53, dec: 89.26, mag: 1.98 },
  Saiph: { ra: 5.796, dec: -9.67, mag: 2.07 },
  Mizar: { ra: 13.399, dec: 54.93, mag: 2.23 },
  Mintaka: { ra: 5.533, dec: -0.3, mag: 2.23 },
  Schedar: { ra: 0.675, dec: 56.54, mag: 2.24 },
  Caph: { ra: 0.153, dec: 59.15, mag: 2.28 },
  Navi: { ra: 0.945, dec: 60.72, mag: 2.3 },
  Merak: { ra: 11.031, dec: 56.38, mag: 2.37 },
  Phecda: { ra: 11.897, dec: 53.69, mag: 2.44 },
  Ruchbah: { ra: 1.43, dec: 60.24, mag: 2.68 },
  Megrez: { ra: 12.257, dec: 57.03, mag: 3.31 },
  Segin: { ra: 1.907, dec: 63.67, mag: 3.37 },
  Pleiades: { ra: 3.79, dec: 24.1, mag: 1.6 },
};

/** Star patterns people know, as lines between the stars above. */
export const FIGURES: { name: string; lines: [string, string][] }[] = [
  {
    name: "Big Dipper",
    lines: [
      ["Alkaid", "Mizar"],
      ["Mizar", "Alioth"],
      ["Alioth", "Megrez"],
      ["Megrez", "Dubhe"],
      ["Dubhe", "Merak"],
      ["Merak", "Phecda"],
      ["Phecda", "Megrez"],
    ],
  },
  {
    name: "Orion",
    lines: [
      ["Betelgeuse", "Bellatrix"],
      ["Betelgeuse", "Alnitak"],
      ["Bellatrix", "Mintaka"],
      ["Alnitak", "Alnilam"],
      ["Alnilam", "Mintaka"],
      ["Alnitak", "Saiph"],
      ["Mintaka", "Rigel"],
    ],
  },
  {
    name: "Cassiopeia",
    lines: [
      ["Caph", "Schedar"],
      ["Schedar", "Navi"],
      ["Navi", "Ruchbah"],
      ["Ruchbah", "Segin"],
    ],
  },
  {
    name: "Summer Triangle",
    lines: [
      ["Vega", "Deneb"],
      ["Deneb", "Altair"],
      ["Altair", "Vega"],
    ],
  },
];

export const observer = (lat: number, lon: number) => new Observer(lat, lon, 0);

export function bodyAt(body: Body, t: number, obs: Observer): AltAz {
  const d = new Date(t);
  const eq = Equator(body, d, obs, true, true);
  const h = Horizon(d, obs, eq.ra, eq.dec, "normal");
  return { alt: h.altitude, az: h.azimuth };
}

export function starAt(name: string, t: number, obs: Observer): AltAz {
  const s = STARS[name];
  const h = Horizon(new Date(t), obs, s.ra, s.dec, "normal");
  return { alt: h.altitude, az: h.azimuth };
}

const time = (x: { date: Date } | null) => (x ? x.date.getTime() : undefined);

export type Night = {
  /** Sunset and sunrise around tonight. */
  sunset: number;
  sunrise: number;
  /** Astronomical darkness (sun 18° down); missing on short summer nights. */
  darkFrom?: number;
  darkTo?: number;
};

/** The night we're in, or the coming one when the sun is still up. */
export function nightOf(now: number, obs: Observer): Night | undefined {
  const up = bodyAt(Body.Sun, now, obs).alt > -0.833;
  const sunset = up
    ? time(SearchRiseSet(Body.Sun, obs, -1, new Date(now), 1))
    : time(SearchRiseSet(Body.Sun, obs, -1, new Date(now - DAY), 1));
  if (sunset === undefined) return undefined;
  const sunrise = time(SearchRiseSet(Body.Sun, obs, +1, new Date(sunset), 1));
  if (sunrise === undefined) return undefined;
  const darkFrom = time(SearchAltitude(Body.Sun, obs, -1, new Date(sunset), 0.6, -18));
  const darkTo = darkFrom !== undefined ? time(SearchAltitude(Body.Sun, obs, +1, new Date(darkFrom), 0.6, -18)) : undefined;
  return {
    sunset,
    sunrise,
    darkFrom: darkFrom !== undefined && darkFrom < sunrise ? darkFrom : undefined,
    darkTo: darkTo !== undefined && darkTo < sunrise ? darkTo : undefined,
  };
}

export function sunAlt(t: number, obs: Observer) {
  return bodyAt(Body.Sun, t, obs).alt;
}

export type MoonInfo = {
  /** 0 = new, 90 = first quarter, 180 = full, 270 = last quarter. */
  phase: number;
  lit: number;
  name: string;
  rise?: number;
  set?: number;
  nextFull?: number;
  nextNew?: number;
};

export function moonPhaseName(phase: number) {
  if (phase < 6 || phase >= 354) return "New moon";
  if (phase < 84) return "Waxing crescent";
  if (phase < 96) return "First quarter";
  if (phase < 174) return "Waxing gibbous";
  if (phase < 186) return "Full moon";
  if (phase < 264) return "Waning gibbous";
  if (phase < 276) return "Last quarter";
  return "Waning crescent";
}

export function moonInfo(now: number, night: Night, obs: Observer): MoonInfo {
  const phase = MoonPhase(new Date(now));
  const from = new Date(night.sunset - 6 * HOUR);
  return {
    phase,
    lit: Illumination(Body.Moon, new Date(now)).phase_fraction,
    name: moonPhaseName(phase),
    rise: time(SearchRiseSet(Body.Moon, obs, +1, from, 1.2)),
    set: time(SearchRiseSet(Body.Moon, obs, -1, from, 1.2)),
    nextFull: time(SearchMoonPhase(180, new Date(now), 32)),
    nextNew: time(SearchMoonPhase(0, new Date(now), 32)),
  };
}

export type PlanetNight = {
  name: string;
  colour: string;
  body: Body;
  /** Visible: above 8° while the sun is at least 6° down. */
  from?: number;
  to?: number;
  best?: number;
  bestAlt?: number;
  bestAz?: number;
  mag: number;
};

export function planetsTonight(night: Night, obs: Observer): PlanetNight[] {
  const times: number[] = [];
  for (let t = night.sunset; t <= night.sunrise; t += STEP) times.push(t);
  const darkEnough = times.map((t) => sunAlt(t, obs) < -6);
  return PLANETS.map(({ body, name, colour }) => {
    const p: PlanetNight = { name, colour, body, mag: Illumination(body, new Date(night.sunset)).mag };
    times.forEach((t, i) => {
      if (!darkEnough[i]) return;
      const { alt, az } = bodyAt(body, t, obs);
      if (alt < 8) return;
      p.from ??= t;
      p.to = t;
      if (p.bestAlt === undefined || alt > p.bestAlt) {
        p.best = t;
        p.bestAlt = alt;
        p.bestAz = az;
      }
    });
    return p;
  });
}

export const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
export const COMPASS_WORDS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
export const direction = (az: number) => Math.round((((az % 360) + 360) % 360) / 45) % 8;

export type Pass = {
  start: number;
  end: number;
  peak: number;
  maxAlt: number;
  startAz: number;
  endAz: number;
};

/** Visible ISS passes: the station in sunlight, above 10°, with the sky at least nautically dark. */
export function issPasses(tle: Tle, from: number, days: number, lat: number, lon: number, obs: Observer): Pass[] {
  let sat;
  try {
    sat = twoline2satrec(tle.line1, tle.line2);
  } catch {
    return [];
  }
  const site = { latitude: degreesToRadians(lat), longitude: degreesToRadians(lon), height: 0 };
  const passes: Pass[] = [];
  let cur: Pass | undefined;
  const step = 20_000;
  for (let t = from; t < from + days * DAY; t += step) {
    const d = new Date(t);
    const pv = propagate(sat, d);
    if (!pv || typeof pv.position !== "object") continue;
    const look = ecfToLookAngles(site, eciToEcf(pv.position, gstime(d)));
    const alt = (look.elevation * 180) / Math.PI;
    let visible = false;
    if (alt >= 10 && sunAlt(t, obs) < -6) {
      visible = !inShadow(pv.position as { x: number; y: number; z: number }, d);
    }
    if (visible) {
      const az = (look.azimuth * 180) / Math.PI;
      if (!cur) cur = { start: t, end: t, peak: t, maxAlt: alt, startAz: az, endAz: az };
      cur.end = t;
      cur.endAz = az;
      if (alt > cur.maxAlt) {
        cur.maxAlt = alt;
        cur.peak = t;
      }
    } else if (cur) {
      if (cur.end - cur.start >= 40_000) passes.push(cur);
      cur = undefined;
    }
  }
  if (cur) passes.push(cur);
  return passes;
}

export type Cloud = { t: number; cover: number };
/** Below this much cloud (%) an hour counts as clear. */
export const CLEAR = 35;

export function cloudsUrl(lat: number, lon: number) {
  const q = new URLSearchParams({
    // Two decimals is about 1 km: plenty for clouds, and no exact location leaves the browser.
    latitude: lat.toFixed(2),
    longitude: lon.toFixed(2),
    hourly: "cloud_cover",
    timezone: "UTC",
    forecast_days: "3",
  });
  return `https://api.open-meteo.com/v1/forecast?${q}`;
}

export function parseClouds(raw: { hourly?: { time?: string[]; cloud_cover?: (number | null)[] } }): Cloud[] {
  const times = raw.hourly?.time ?? [];
  const cover = raw.hourly?.cloud_cover ?? [];
  return times
    .map((t, i) => ({ t: Date.parse(`${t}:00Z`), cover: cover[i] ?? NaN }))
    .filter((c) => Number.isFinite(c.cover));
}

export type CloudVerdict =
  | { kind: "clear" }
  | { kind: "spells"; from: number; to?: number }
  | { kind: "cloudy" };

/** Clear all night, clear for part of it, or cloudy, judged over the dark hours. */
export function cloudVerdict(night: Night, clouds: Cloud[]): CloudVerdict | undefined {
  const from = night.darkFrom ?? night.sunset + 60 * 60_000;
  const to = night.darkTo ?? night.sunrise - 60 * 60_000;
  const dark = clouds.filter((c) => c.t + HOUR > from && c.t < to);
  if (!dark.length) return undefined;
  const clear = dark.filter((c) => c.cover < CLEAR);
  if (clear.length === dark.length) return { kind: "clear" };
  if (!clear.length) return { kind: "cloudy" };
  const first = clear[0].t;
  let last = first;
  for (const c of dark) if (c.t > first && c.cover < CLEAR && c.t - last <= HOUR) last = c.t;
  return { kind: "spells", from: Math.max(first, from), to: last === dark.at(-1)!.t ? undefined : last + HOUR };
}
