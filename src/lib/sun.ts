// Sun times from the NOAA solar equations (accurate to about a minute at Belgian latitudes).
// Everything runs in the browser; no API needed.

const rad = Math.PI / 180;
const DAY = 864e5;

/** Declination (radians) and equation of time (minutes) for a UTC moment. */
function solar(t: number) {
  const d = new Date(t);
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  const leap = new Date(Date.UTC(d.getUTCFullYear(), 1, 29)).getUTCMonth() === 1;
  const g = ((2 * Math.PI) / (leap ? 366 : 365)) * ((t - start) / DAY);
  const eqTime =
    229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl =
    0.006918 -
    0.399912 * Math.cos(g) +
    0.070257 * Math.sin(g) -
    0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) -
    0.002697 * Math.cos(3 * g) +
    0.00148 * Math.sin(3 * g);
  return { decl, eqTime };
}

/** Sun elevation in degrees at a moment and place. */
export function elevation(t: number, lat: number, lon: number) {
  const { decl, eqTime } = solar(t);
  const d = new Date(t);
  const minutes = d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60;
  const ha = ((minutes + eqTime + 4 * lon) / 4 - 180) * rad;
  const phi = lat * rad;
  const cosZ = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(ha);
  return 90 - Math.acos(Math.min(1, Math.max(-1, cosZ))) / rad;
}

/**
 * When the sun crosses `elev` degrees on the UTC day that starts at `dayStart`, rising and setting (unix ms).
 * Undefined when it never gets that high or never that low.
 */
function crossing(dayStart: number, lat: number, lon: number, elev: number) {
  // Two passes: the second uses the sun's position at the first estimate.
  let rise = dayStart + DAY / 2;
  let set = dayStart + DAY / 2;
  for (let pass = 0; pass < 2; pass++) {
    const out: number[] = [];
    for (const [t, sign] of [
      [rise, 1],
      [set, -1],
    ] as const) {
      const { decl, eqTime } = solar(t);
      const phi = lat * rad;
      const cosH = (Math.sin(elev * rad) - Math.sin(phi) * Math.sin(decl)) / (Math.cos(phi) * Math.cos(decl));
      if (cosH > 1 || cosH < -1) return undefined;
      const h = Math.acos(cosH) / rad;
      out.push(dayStart + (720 - 4 * (lon + sign * h) - eqTime) * 60_000);
    }
    [rise, set] = out;
  }
  return { rise, set };
}

export type SunDay = {
  sunrise: number;
  sunset: number;
  /** Daylight in minutes. */
  length: number;
  /** Morning and evening golden hour: sun between the horizon and 6° up. */
  goldenMorningEnd?: number;
  goldenEveningStart?: number;
  /** Civil dusk and dawn: sun 6° below the horizon, when it is really dark. */
  dawn?: number;
  dusk?: number;
};

/** Sun times for the calendar day `ymd` ("2026-11-24") at a place. */
export function sunDay(ymd: string, lat: number, lon: number): SunDay | undefined {
  const [y, m, d] = ymd.split("-").map(Number);
  const start = Date.UTC(y, m - 1, d);
  const main = crossing(start, lat, lon, -0.833);
  if (!main) return undefined;
  const golden = crossing(start, lat, lon, 6);
  const civil = crossing(start, lat, lon, -6);
  return {
    sunrise: main.rise,
    sunset: main.set,
    length: (main.set - main.rise) / 60_000,
    goldenMorningEnd: golden?.rise,
    goldenEveningStart: golden?.set,
    dawn: civil?.rise,
    dusk: civil?.set,
  };
}

/** The next solstice after `ymd`, as { date, shortest } (northern hemisphere naming). */
export function nextSolstice(ymd: string) {
  const y = Number(ymd.slice(0, 4));
  const options = [`${y}-06-21`, `${y}-12-21`, `${y + 1}-06-21`];
  const date = options.find((o) => o > ymd)!;
  return { date, shortest: date.endsWith("12-21") };
}

export const addDays = (ymd: string, n: number) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);
