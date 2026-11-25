// The ISS orbit as a two-line element set (TLE). It changes slowly, so a few hours of caching is fine.
// Two sources with the same NORAD data; whichever answers first wins, because CelesTrak is sometimes slow.
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { cacheLife } from "next/cache";
import { DATA_DIR } from "./db";
import type { Tle } from "./sky";

export const TLE_SOURCE = "https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE";
const TLE_MIRROR = "https://tle.ivanstanojevic.me/api/tle/25544";

const valid = (t: Partial<Tle>): t is Tle => !!t.line1?.startsWith("1 25544") && !!t.line2?.startsWith("2 25544");

async function fromCelestrak(): Promise<Tle> {
  const res = await fetch(TLE_SOURCE, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(String(res.status));
  const [name, line1, line2] = (await res.text()).trim().split(/\r?\n/).map((l) => l.trim());
  const tle = { name, line1, line2 };
  if (!valid(tle)) throw new Error("bad TLE");
  return tle;
}

async function fromMirror(): Promise<Tle> {
  const res = await fetch(TLE_MIRROR, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(String(res.status));
  const json = (await res.json()) as { name?: string; line1?: string; line2?: string };
  const tle = { name: json.name ?? "ISS", line1: json.line1?.trim(), line2: json.line2?.trim() };
  if (!valid(tle)) throw new Error("bad TLE");
  return tle;
}

// The last good TLE, kept in the data folder. Both sources rate-limit, and an
// orbit stays good enough for a few days, so a week-old copy beats showing nothing.
const SAVED = path.join(/*turbopackIgnore: true*/ DATA_DIR, "iss-tle.json");
const SAVED_MAX_AGE = 7 * 86_400_000;

async function save(tle: Tle) {
  try {
    await mkdir(path.dirname(SAVED), { recursive: true });
    await writeFile(SAVED, JSON.stringify({ ...tle, savedAt: Date.now() }));
  } catch {}
}

async function saved(): Promise<Tle | undefined> {
  try {
    const t = JSON.parse(await readFile(SAVED, "utf8")) as Tle & { savedAt: number };
    if (valid(t) && Date.now() - t.savedAt < SAVED_MAX_AGE) return { name: t.name, line1: t.line1, line2: t.line2 };
  } catch {}
  return undefined;
}

export async function getIssTle(): Promise<Tle | undefined> {
  "use cache";
  try {
    const tle = await Promise.any([fromCelestrak(), fromMirror()]);
    await save(tle);
    cacheLife({ stale: 3600, revalidate: 6 * 3600, expire: 3 * 86400 });
    return tle;
  } catch {
    // Both failed: use the saved copy, and try the sources again soon.
    cacheLife({ stale: 60, revalidate: 900, expire: 3600 });
    return saved();
  }
}
