// Where Belgium's electricity comes from: actual production per source (hourly) and the
// forecast share of wind and solar for today, both from the Energy-Charts API (CC BY 4.0).
import { cacheLife } from "next/cache";
import { fetchHtml } from "./comparer/html";

export type MixSource = { id: string; label: string; mw: number; renewable: boolean };

export type PowerMix = {
  /** Start of the latest hour with data (unix ms). */
  at: number;
  sources: MixSource[];
  /** Share of consumption covered by renewables, in %. */
  renewableShare: number;
  /** Power sent abroad in that hour, in MW (0 when Belgium was importing). */
  exportMw: number;
  /** Forecast share of wind and solar per hour of today, in %. */
  forecast: { t: number; share: number }[];
};

// Energy-Charts names → our groups. Anything not listed (load, residual load, shares,
// pumped storage *consumption*) is not production and is left out.
const GROUPS: Record<string, { id: string; label: string; renewable: boolean }> = {
  Nuclear: { id: "nuclear", label: "Nuclear", renewable: false },
  "Fossil gas": { id: "gas", label: "Gas", renewable: false },
  "Fossil oil": { id: "gas", label: "Gas", renewable: false },
  "Wind offshore": { id: "wind", label: "Wind", renewable: true },
  "Wind onshore": { id: "wind", label: "Wind", renewable: true },
  Solar: { id: "solar", label: "Solar", renewable: true },
  Biomass: { id: "bio", label: "Biomass and waste", renewable: true },
  Waste: { id: "bio", label: "Biomass and waste", renewable: true },
  "Hydro Run-of-River": { id: "storage", label: "Hydro and storage", renewable: false },
  "Hydro pumped storage": { id: "storage", label: "Hydro and storage", renewable: false },
  Battery: { id: "storage", label: "Hydro and storage", renewable: false },
  Others: { id: "other", label: "Other", renewable: false },
};

const brusselsDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(d);

type Series = { unix_seconds?: unknown; production_types?: { name: string; data: (number | null)[] }[] };

export async function getPowerMix(): Promise<PowerMix | undefined> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 900, expire: 6 * 3600 });
  const now = new Date();
  try {
    const day = brusselsDate(now);
    const [power, forecast] = await Promise.all([
      fetchHtml(`https://api.energy-charts.info/public_power?country=be&start=${day}&end=${day}`, 20000).then(
        (t) => JSON.parse(t) as Series,
      ),
      fetchHtml("https://api.energy-charts.info/ren_share_forecast?country=be", 20000)
        .then((t) => JSON.parse(t) as { unix_seconds?: unknown; ren_share?: unknown })
        .catch(() => undefined),
    ]);
    if (!Array.isArray(power.unix_seconds) || !Array.isArray(power.production_types)) throw new Error("Unexpected response");
    const times = power.unix_seconds as number[];
    const types = power.production_types;
    const nuclear = types.find((p) => p.name === "Nuclear");
    // The latest hour where production is actually filled in.
    let i = times.length - 1;
    while (i >= 0 && typeof nuclear?.data[i] !== "number") i--;
    if (i < 0) throw new Error("No production data yet");

    const byId = new Map<string, MixSource>();
    for (const p of types) {
      const g = GROUPS[p.name];
      const v = p.data[i];
      if (!g || typeof v !== "number" || v <= 0) continue;
      const s = byId.get(g.id) ?? { ...g, mw: 0 };
      s.mw += v;
      byId.set(g.id, s);
    }
    const trade = types.find((p) => p.name === "Cross border electricity trading")?.data[i] ?? 0;
    if (trade > 0) byId.set("imports", { id: "imports", label: "Imports", mw: trade, renewable: false });
    const share = types.find((p) => p.name === "Renewable share of load")?.data[i];

    const fc =
      forecast && Array.isArray(forecast.unix_seconds) && Array.isArray(forecast.ren_share)
        ? (forecast.unix_seconds as number[]).flatMap((t, k) => {
            const v = (forecast.ren_share as unknown[])[k];
            return typeof v === "number" ? [{ t: t * 1000, share: v }] : [];
          })
        : [];

    return {
      at: Number(times[i]) * 1000,
      sources: [...byId.values()].sort((a, b) => b.mw - a.mw),
      renewableShare: typeof share === "number" ? share : 0,
      exportMw: trade < 0 ? -trade : 0,
      forecast: fc,
    };
  } catch (e) {
    console.error("power mix fetch failed", e);
    cacheLife("minutes");
    return undefined;
  }
}
