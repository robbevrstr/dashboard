// Belgian day-ahead electricity prices (bidding zone BE) via the Energy-Charts
// API of Fraunhofer ISE. Free, no key; data CC BY 4.0 from Bundesnetzagentur | SMARD.de.
import { cacheLife } from "next/cache";
import { fetchHtml } from "./comparer/html";

export const POWER_SOURCE = "https://energy-charts.info/charts/price_spot_market/chart.htm?l=en&c=BE";

export type PowerData =
  | {
      ok: true;
      fetchedAt: string;
      /** Start of each slot (unix ms) and its price in €/MWh. Slots are 15 minutes (or 60 for older data). */
      slots: { t: number; price: number }[];
    }
  | { ok: false; fetchedAt: string };

const brusselsDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(d);

export async function getPowerPrices(): Promise<PowerData> {
  "use cache";
  // Tomorrow's prices are published around 13:00, so check fairly often.
  cacheLife({ stale: 300, revalidate: 900, expire: 6 * 3600 });
  const now = new Date();
  const fetchedAt = now.toISOString();
  try {
    const start = brusselsDate(new Date(now.getTime() - 864e5));
    const end = brusselsDate(new Date(now.getTime() + 2 * 864e5));
    const url = `https://api.energy-charts.info/price?bzn=BE&start=${start}&end=${end}`;
    const json = JSON.parse(await fetchHtml(url, 20000)) as { unix_seconds?: unknown; price?: unknown };
    if (!Array.isArray(json.unix_seconds) || !Array.isArray(json.price)) throw new Error("Unexpected response");
    const prices = json.price as unknown[];
    const slots = (json.unix_seconds as unknown[])
      // null means "not published yet": skip it rather than read it as €0.
      .flatMap((s, i) => (prices[i] === null || prices[i] === undefined ? [] : [{ t: Number(s) * 1000, price: Number(prices[i]) }]))
      .filter((s) => Number.isFinite(s.t) && Number.isFinite(s.price) && Math.abs(s.price) < 5000);
    if (!slots.length) throw new Error("No prices");
    return { ok: true, fetchedAt, slots };
  } catch (e) {
    console.error("power prices fetch failed", e);
    cacheLife("minutes");
    return { ok: false, fetchedAt };
  }
}
