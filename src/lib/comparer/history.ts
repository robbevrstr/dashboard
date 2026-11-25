// Stores the lowest price of every fresh search so items can show a price
// history, in the dashboard's SQLite database (see ../db.ts).
import { db as openDb } from "../db";
import type { HistoryPoint, Offer } from "./types";

const DAY = 24 * 60 * 60 * 1000;
/** At most one point per item per hour, so repeated searches can't flood the table. */
const MIN_GAP_MS = 60 * 60 * 1000;
/** Lots of different searches could still grow it, so the oldest points go above this. */
const MAX_ROWS = 100_000;

const g = globalThis as unknown as { __historyPruned?: boolean };

async function db() {
  const conn = await openDb();
  if (!g.__historyPruned) {
    // Keep the file small: a year of history is all the chart ever shows.
    conn.prepare("DELETE FROM price_points WHERE checked_at < ?").run(Date.now() - 365 * DAY);
    g.__historyPruned = true;
  }
  return conn;
}

/** The headline price for an item: cheapest new product, else cheapest of any condition. */
export function headline(offers: Offer[]) {
  const products = offers.filter((o) => !o.accessory);
  const cheapest = products[0];
  const cheapestNew = products.find((o) => o.condition === "new");
  return { cheapest, cheapestNew, price: cheapestNew?.price ?? cheapest?.price };
}

export async function recordPoint(queryKey: string, offers: Offer[]) {
  const { cheapest, cheapestNew } = headline(offers);
  const best = cheapestNew ?? cheapest;
  if (!cheapest || !best) return;
  const conn = await db();
  const recent = conn
    .prepare("SELECT 1 FROM price_points WHERE query_key = ? AND checked_at > ? LIMIT 1")
    .get(queryKey, Date.now() - MIN_GAP_MS);
  if (recent) return;
  conn
    .prepare(
      `INSERT INTO price_points (query_key, checked_at, lowest, lowest_new, retailer, title, url)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      queryKey,
      Date.now(),
      cheapest.price,
      cheapestNew?.price ?? null,
      best.retailer,
      best.title,
      best.url,
    );
  const { n } = conn.prepare("SELECT COUNT(*) AS n FROM price_points").get() as { n: number };
  if (n > MAX_ROWS) {
    conn
      .prepare("DELETE FROM price_points WHERE id IN (SELECT id FROM price_points ORDER BY checked_at LIMIT ?)")
      .run(n - MAX_ROWS + 1000);
  }
}

export async function getHistory(queryKey: string, days = 180): Promise<HistoryPoint[]> {
  const since = Date.now() - days * DAY;
  const rows = (await db())
    .prepare(
      `SELECT checked_at, lowest, lowest_new, retailer FROM price_points
       WHERE query_key = ? AND checked_at >= ? ORDER BY checked_at`,
    )
    .all(queryKey, since) as {
    checked_at: number;
    lowest: number;
    lowest_new: number | null;
    retailer: string;
  }[];
  return rows.map((r) => ({
    at: r.checked_at,
    price: r.lowest_new ?? r.lowest,
    retailer: r.retailer as HistoryPoint["retailer"],
  }));
}
