// "Should I go out?": turns an hourly Open-Meteo forecast into a verdict per hour,
// for cycling, running or walking.

export type Place = { name: string; lat: number; lon: number };

export const PLACES: Place[] = [
  { name: "Aalst", lat: 50.94, lon: 4.04 },
  { name: "Antwerp", lat: 51.22, lon: 4.4 },
  { name: "Bruges", lat: 51.21, lon: 3.22 },
  { name: "Brussels", lat: 50.85, lon: 4.35 },
  { name: "Charleroi", lat: 50.41, lon: 4.44 },
  { name: "Genk", lat: 50.97, lon: 5.5 },
  { name: "Ghent", lat: 51.05, lon: 3.72 },
  { name: "Hasselt", lat: 50.93, lon: 5.33 },
  { name: "Kortrijk", lat: 50.83, lon: 3.26 },
  { name: "Leuven", lat: 50.88, lon: 4.7 },
  { name: "Liège", lat: 50.63, lon: 5.58 },
  { name: "Mechelen", lat: 51.03, lon: 4.48 },
  { name: "Mons", lat: 50.45, lon: 3.96 },
  { name: "Namur", lat: 50.47, lon: 4.87 },
  { name: "Ostend", lat: 51.22, lon: 2.93 },
  { name: "Roeselare", lat: 50.95, lon: 3.12 },
];

export type Hour = {
  time: string; // "2026-11-24T14:00" (Brussels)
  temp: number;
  feels: number;
  rain: number; // mm in that hour
  chance: number; // %
  code: number; // WMO weather code
  wind: number; // km/h
  gusts: number; // km/h
  windFrom: number; // degrees
  aqi?: number; // European AQI, when the air quality data has loaded
  dark?: boolean; // sun below the horizon
};

export type Forecast = {
  hours: Hour[];
  quarters: { time: string; rain: number }[];
  /** Offset of the local times above from UTC, in seconds. */
  offset: number;
};

/** "2026-11-24T14:00" in the forecast's own time zone → unix ms. */
export const toUnix = (time: string, offset: number) => Date.parse(`${time}:00Z`) - offset * 1000;

/** 0 = go, 1 = go but prepare, 2 = better not */
export type Level = 0 | 1 | 2;

const HOURLY = [
  "temperature_2m",
  "apparent_temperature",
  "precipitation",
  "precipitation_probability",
  "weather_code",
  "wind_speed_10m",
  "wind_gusts_10m",
  "wind_direction_10m",
];

export function forecastUrl(lat: number, lon: number) {
  const q = new URLSearchParams({
    // Two decimals is about 1 km: plenty for weather, and no exact location leaves the browser.
    latitude: lat.toFixed(2),
    longitude: lon.toFixed(2),
    hourly: HOURLY.join(","),
    // 15-minute "current" conditions, more accurate for "right now" than the hourly forecast.
    current: HOURLY.filter((k) => k !== "precipitation_probability").join(","),
    minutely_15: "precipitation",
    timezone: "Europe/Brussels",
    forecast_hours: "13",
    forecast_minutely_15: "12",
  });
  return `https://api.open-meteo.com/v1/forecast?${q}`;
}

type Raw = {
  hourly: Record<string, (number | null)[]> & { time: string[] };
  minutely_15?: { time: string[]; precipitation: (number | null)[] };
  current?: Record<string, number | string | null>;
  utc_offset_seconds?: number;
};

export function parseForecast(raw: Raw): Forecast {
  const h = raw.hourly;
  const n = (key: string, i: number) => h[key]?.[i] ?? 0;
  const hours: Hour[] = h.time.map((time, i) => ({
      time,
      temp: n("temperature_2m", i),
      feels: n("apparent_temperature", i),
      rain: n("precipitation", i),
      chance: n("precipitation_probability", i),
      code: n("weather_code", i),
      wind: n("wind_speed_10m", i),
      gusts: n("wind_gusts_10m", i),
      windFrom: n("wind_direction_10m", i),
  }));

  // Swap the first hour's values for the current 15-minute reading where there is one.
  const c = raw.current;
  const num = (key: string) => (typeof c?.[key] === "number" ? (c[key] as number) : undefined);
  if (c && hours[0]) {
    const first = hours[0];
    hours[0] = {
      ...first,
      temp: num("temperature_2m") ?? first.temp,
      feels: num("apparent_temperature") ?? first.feels,
      // current precipitation covers 15 minutes; scale it to mm per hour
      rain: Math.max(first.rain, (num("precipitation") ?? 0) * 4),
      code: num("weather_code") ?? first.code,
      wind: num("wind_speed_10m") ?? first.wind,
      gusts: num("wind_gusts_10m") ?? first.gusts,
      windFrom: num("wind_direction_10m") ?? first.windFrom,
    };
  }

  return {
    hours,
    offset: raw.utc_offset_seconds ?? 0,
    quarters: (raw.minutely_15?.time ?? []).map((time, i) => ({
      time,
      rain: raw.minutely_15?.precipitation[i] ?? 0,
    })),
  };
}

export type Activity = "bike" | "run" | "walk";
export const ACTIVITIES: Activity[] = ["bike", "run", "walk"];

/**
 * Where each activity draws its lines. Runners and walkers mind rain and wind less than
 * cyclists, but runners feel heat and bad air more, since they breathe harder for longer.
 */
const LIMITS: Record<
  Activity,
  { heavyRain: number; someRain: number; showers: boolean; stormGust: number; strongGust: number; strongWind: number; cold: number; hot: number; warm?: number; aqiMeh: number; aqiBad: number }
> = {
  bike: { heavyRain: 1.5, someRain: 0.3, showers: true, stormGust: 65, strongGust: 45, strongWind: 30, cold: 0, hot: 30, aqiMeh: 80, aqiBad: 100 },
  run: { heavyRain: 3, someRain: 1, showers: false, stormGust: 75, strongGust: 55, strongWind: 40, cold: -10, hot: 30, warm: 25, aqiMeh: 60, aqiBad: 80 },
  walk: { heavyRain: 2, someRain: 0.3, showers: true, stormGust: 75, strongGust: 55, strongWind: 40, cold: -5, hot: 30, aqiMeh: 80, aqiBad: 100 },
};

/** The verdict for one hour, with the reasons that decided it (worst first). */
export function rate(h: Hour, activity: Activity = "bike"): { level: Level; reasons: string[] } {
  const L = LIMITS[activity];
  const onFoot = activity !== "bike";
  const bad: string[] = [];
  const meh: string[] = [];
  if ([95, 96, 99].includes(h.code)) bad.push("thunderstorms");
  if ([71, 73, 75, 77, 85, 86].includes(h.code)) (onFoot ? meh : bad).push("snow");
  if ([56, 57, 66, 67].includes(h.code)) bad.push("freezing rain");
  const iceRain = h.rain >= 0.1 && h.temp <= 1 && !bad.length;
  if (iceRain) {
    if (onFoot) meh.push("slippery paths (rain near freezing)");
    else bad.push("rain near freezing (slippery roads)");
  }
  if (h.rain >= L.heavyRain) bad.push(`heavy rain (${mm(h.rain)})`);
  else if (h.rain >= L.someRain) meh.push(`some rain (${mm(h.rain)})`);
  else if (L.showers && !iceRain && (h.rain > 0 || h.chance >= 50)) meh.push(`a ${Math.max(h.chance, 20)}% chance of showers`);
  if (h.gusts >= L.stormGust) bad.push(`storm gusts up to ${Math.round(h.gusts)} km/h`);
  else if (h.gusts >= L.strongGust || h.wind >= L.strongWind) meh.push(`strong wind (gusts up to ${Math.round(h.gusts)} km/h)`);
  if (!onFoot && [45, 48].includes(h.code)) meh.push("fog");
  if (h.temp <= 1 && !bad.length && !meh.some((r) => r.startsWith("slippery"))) meh.push("icy patches in places");
  if (h.feels <= L.cold) meh.push(`${h.feels <= L.cold - 5 ? "freezing cold" : "cold"} (feels like ${Math.round(h.feels)}°)`);
  if (h.temp >= L.hot) (activity === "run" ? bad : meh).push(`heat (${Math.round(h.temp)}°)`);
  else if (L.warm !== undefined && h.temp >= L.warm) meh.push(`warm weather (${Math.round(h.temp)}°)`);
  if (h.aqi !== undefined) {
    if (h.aqi >= L.aqiBad) bad.push(`very poor air quality (index ${Math.round(h.aqi)})`);
    else if (h.aqi >= L.aqiMeh) meh.push(`poor air quality (index ${Math.round(h.aqi)})`);
  }
  if (bad.length) return { level: 2, reasons: [...bad, ...meh] };
  if (meh.length) return { level: 1, reasons: meh };
  return { level: 0, reasons: [] };
}

/** Short practical advice for an hour, separate from the verdict. */
export function tips(h: Hour, activity: Activity) {
  const out: string[] = [];
  if (h.dark) out.push(activity === "bike" ? "It's dark, so turn your lights on." : "It's dark, so wear something bright.");
  if (activity === "run") {
    if (h.feels <= 0) out.push("Gloves and a long layer help.");
    else if (h.temp >= 22) out.push("Take water.");
  } else if (h.feels <= 0) out.push("Wear gloves and a hat.");
  if (activity === "walk" && h.rain >= 0.3 && h.rain < 2) out.push("Bring an umbrella.");
  return out;
}

// --- Air quality and pollen (Open-Meteo air quality API, CAMS data) ---

export const POLLEN = [
  { key: "alder_pollen", name: "Alder", moderate: 10, high: 100 },
  { key: "birch_pollen", name: "Birch", moderate: 10, high: 100 },
  { key: "grass_pollen", name: "Grass", moderate: 10, high: 50 },
  { key: "mugwort_pollen", name: "Mugwort", moderate: 5, high: 20 },
  { key: "ragweed_pollen", name: "Ragweed", moderate: 5, high: 20 },
] as const;

export function airUrl(lat: number, lon: number) {
  const q = new URLSearchParams({
    latitude: lat.toFixed(2),
    longitude: lon.toFixed(2),
    hourly: ["european_aqi", ...POLLEN.map((p) => p.key)].join(","),
    current: "european_aqi,pm2_5,pm10,nitrogen_dioxide,ozone",
    timezone: "Europe/Brussels",
    forecast_hours: "13",
  });
  return `https://air-quality-api.open-meteo.com/v1/air-quality?${q}`;
}

export type Air = {
  now?: { aqi: number; pm25: number; pm10: number; no2: number; o3: number };
  /** European AQI per hour, keyed by "2026-11-24T14:00". */
  aqi: Record<string, number>;
  /** Highest pollen count in the next 12 hours, per type. */
  pollen: { name: string; value: number; level: 0 | 1 | 2 }[];
};

export function parseAir(raw: {
  hourly?: Record<string, (number | null)[]> & { time?: string[] };
  current?: Record<string, number | string | null>;
}): Air {
  const h = raw.hourly;
  const aqi: Record<string, number> = {};
  h?.time?.forEach((t, i) => {
    const v = h.european_aqi?.[i];
    if (typeof v === "number") aqi[t] = v;
  });
  const pollen = POLLEN.map((p) => {
    const value = Math.max(0, ...((h?.[p.key] ?? []).filter((v): v is number => typeof v === "number")));
    return { name: p.name, value, level: (value >= p.high ? 2 : value >= p.moderate ? 1 : 0) as 0 | 1 | 2 };
  });
  const c = raw.current;
  const n = (k: string) => (typeof c?.[k] === "number" ? (c[k] as number) : NaN);
  const now = c && Number.isFinite(n("european_aqi"))
    ? { aqi: n("european_aqi"), pm25: n("pm2_5"), pm10: n("pm10"), no2: n("nitrogen_dioxide"), o3: n("ozone") }
    : undefined;
  return { now, aqi, pollen };
}

/** The European Air Quality Index bands. */
export function aqiBand(v: number) {
  if (v < 20) return "good";
  if (v < 40) return "fair";
  if (v < 60) return "moderate";
  if (v < 80) return "poor";
  if (v < 100) return "very poor";
  return "extremely poor";
}

export const mm = (v: number) => `${v.toLocaleString("en-GB", { maximumFractionDigits: 1 })} mm`;

export function compass(deg: number) {
  return ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"][
    Math.round(deg / 45) % 8
  ];
}

/** "Rain starts around 14:15" / "Dry until 16:00" from the 15-minute data for the next few hours. */
export function rainNote(quarters: Forecast["quarters"]) {
  if (!quarters.length) return undefined;
  const wet = (q: { rain: number }) => q.rain >= 0.1;
  const at = (t: string) => t.slice(11, 16);
  if (wet(quarters[0])) {
    const stop = quarters.find((q) => !wet(q));
    return stop ? `Rain should stop around ${at(stop.time)}.` : "Rain for at least the next few hours.";
  }
  const start = quarters.find(wet);
  return start ? `Rain starts around ${at(start.time)}.` : `Dry until at least ${at(quarters.at(-1)!.time)}.`;
}
