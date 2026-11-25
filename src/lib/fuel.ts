// Official Belgian maximum fuel prices, published daily by FOD Economie via
// Statbel's be.STAT open data (view: "last 365 changes", CSV).
import { cacheLife } from "next/cache";
import { fetchHtml } from "./comparer/html";

export const FUEL_SOURCE =
  "https://bestat.statbel.fgov.be/bestat/crosstable.xhtml?view=f8d4c0ce-bec4-4f58-b2a2-4f6b8667ad24";
const CSV_URL =
  "https://bestat.statbel.fgov.be/bestat/api/views/f8d4c0ce-bec4-4f58-b2a2-4f6b8667ad24/result/CSV";

export const FUELS = [
  { id: "e10", label: "Euro 95", detail: "E10", source: "Benzine 95 RON E10 (€/L)", color: "#14b8a6" },
  { id: "e5_98", label: "Super 98", detail: "E5", source: "Benzine 98 RON E5 (€/L)", color: "#8b5cf6" },
  { id: "diesel", label: "Diesel", detail: "B7", source: "Diesel B7 (€/L)", color: "#f59e0b" },
  { id: "lpg", label: "LPG", detail: "Autogas", source: "Autogas LPG (aan de pomp) (€/L)", color: "#0ea5e9" },
  {
    id: "heating",
    label: "Heating oil",
    detail: "Under 2,000 l",
    source: "Gasolie verwarming (H0/H7) (minder dan 2000 l) (€/L)",
    color: "#f43f5e",
  },
] as const;

export type FuelId = (typeof FUELS)[number]["id"];

export type FuelData =
  | {
      ok: true;
      fetchedAt: string;
      /** Daily prices per fuel, date as "YYYY-MM-DD" (Brussels). */
      prices: Record<FuelId, { date: string; price: number }[]>;
    }
  | { ok: false; fetchedAt: string };

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mrt: "03", apr: "04", mei: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", okt: "10", nov: "11", dec: "12",
};

/** "26nov25" → "2025-11-26" */
function parseDay(s: string) {
  const m = s.match(/^(\d{1,2})([a-z]{3})(\d{2})$/);
  if (!m || !MONTHS[m[2]]) return undefined;
  return `20${m[3]}-${MONTHS[m[2]]}-${m[1].padStart(2, "0")}`;
}

/** Splits one CSV line, honouring quotes. */
function cells(line: string) {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === "," && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

export function parseFuelCsv(csv: string) {
  const bySource = new Map<string, FuelId>(FUELS.map((f) => [f.source, f.id]));
  const prices = Object.fromEntries(FUELS.map((f) => [f.id, [] as { date: string; price: number }[]])) as Record<
    FuelId,
    { date: string; price: number }[]
  >;
  for (const line of csv.split(/\r?\n/).slice(1)) {
    const [, day, , product, value] = cells(line);
    const id = bySource.get(product);
    const date = day ? parseDay(day) : undefined;
    const price = parseFloat(value);
    if (id && date && Number.isFinite(price) && price > 0 && price < 10) {
      prices[id].push({ date, price });
    }
  }
  for (const list of Object.values(prices)) list.sort((a, b) => a.date.localeCompare(b.date));
  return prices;
}

export async function getFuelData(): Promise<FuelData> {
  "use cache";
  cacheLife("hours");
  const fetchedAt = new Date().toISOString();
  try {
    const prices = parseFuelCsv(await fetchHtml(CSV_URL, 20000));
    if (!prices.e10.length) throw new Error("No rows parsed");
    return { ok: true, fetchedAt, prices };
  } catch (e) {
    console.error("fuel prices fetch failed", e);
    cacheLife("minutes"); // retry soon instead of caching the failure for hours
    return { ok: false, fetchedAt };
  }
}
