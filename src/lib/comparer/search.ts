import { getHistory, headline, recordPoint } from "./history";
import { BlockedError } from "./html";
import { adapters } from "./retailers";
import { cheapOutliers, extractSpecs, isAccessory, isRefurbished, matchesQuery } from "./specs";
import { IMAGE_HOSTS, RETAILERS, type Offer, type RetailerId, type RetailerStatus, type SearchResponse } from "./types";

// Links and images come from scraped HTML, so only https URLs survive, and
// product links must stay on the shop's own domain.
function safeLink(url: string, retailer: RetailerId) {
  try {
    const u = new URL(url);
    const domain = RETAILERS[retailer].domain;
    const onShop = u.hostname === domain || u.hostname.endsWith(`.${domain}`);
    return u.protocol === "https:" && onShop ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

function safeImage(url: string | undefined) {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    const known = IMAGE_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));
    return u.protocol === "https:" && known ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

export class BusyError extends Error {}

const TTL = 15 * 60 * 1000;
const cache = new Map<string, { at: number; data: SearchResponse }>();
const inFlight = new Map<string, Promise<SearchResponse>>();

// Server-wide cap on fresh (uncached) searches, whoever sends them. This holds
// even if the per-visitor limit is fooled by a spoofed X-Forwarded-For header.
const FRESH_WINDOW_MS = 60_000;
const MAX_FRESH_PER_WINDOW = 30;
let freshSearches: number[] = [];

export async function searchAll(query: string): Promise<SearchResponse> {
  // "iPhone  16" and "iphone 16" share one cache entry and one price history.
  const key = query.toLowerCase().trim().replace(/\s+/g, " ");
  const hit = cache.get(key);
  // Cached offers are fine for a while; history is cheap to read and always fresh.
  if (hit && Date.now() - hit.at < TTL) {
    return { ...hit.data, history: await getHistory(key).catch(() => hit.data.history) };
  }

  // Identical searches running at the same time share one scrape.
  const running = inFlight.get(key);
  if (running) return running;

  const now = Date.now();
  freshSearches = freshSearches.filter((t) => now - t < FRESH_WINDOW_MS);
  if (freshSearches.length >= MAX_FRESH_PER_WINDOW) throw new BusyError();
  freshSearches.push(now);

  const job = scrape(query, key).finally(() => inFlight.delete(key));
  inFlight.set(key, job);
  return job;
}

async function scrape(query: string, key: string): Promise<SearchResponse> {
  const ids = Object.keys(adapters) as RetailerId[];
  const settled = await Promise.allSettled(ids.map((id) => adapters[id](query)));

  const offers: Offer[] = [];
  const retailers: RetailerStatus[] = [];
  const seen = new Set<string>();

  settled.forEach((res, i) => {
    const retailer = ids[i];
    if (res.status === "rejected") {
      retailers.push({
        retailer,
        status: res.reason instanceof BlockedError ? "blocked" : "error",
        count: 0,
      });
      return;
    }
    let count = 0;
    for (const raw of res.value) {
      const url = safeLink(raw.url, retailer);
      if (!url || !matchesQuery(raw.title, query) || seen.has(url)) continue;
      seen.add(url);
      count++;
      offers.push({
        id: `${retailer}:${url}`,
        retailer,
        title: raw.title,
        url,
        image: safeImage(raw.image),
        price: Math.round(raw.price * 100) / 100,
        rating: raw.rating && raw.rating.value > 0 ? raw.rating : undefined,
        condition: raw.refurbished || isRefurbished(raw.title) ? "refurbished" : "new",
        accessory: isAccessory(raw.title, query),
        specs: extractSpecs(raw.title, raw.details ?? [], query),
      });
    }
    retailers.push({ retailer, status: count ? "ok" : "empty", count });
  });

  cheapOutliers(offers, query);
  offers.sort((a, b) => a.price - b.price);

  // Only trust a price point when most shops answered; otherwise a missing shop
  // would show up as a fake price jump in the history.
  const answered = retailers.filter((r) => r.status === "ok" || r.status === "empty").length;
  if (answered >= 4) {
    await recordPoint(key, offers).catch((e) => console.error("price history write failed", e));
  }
  const history = await getHistory(key).catch(() => []);

  const data: SearchResponse = {
    query,
    fetchedAt: new Date().toISOString(),
    offers,
    retailers,
    lowest: headline(offers).price,
    history,
  };
  // Only cache searches where at least one shop answered.
  if (retailers.some((r) => r.status === "ok")) cache.set(key, { at: Date.now(), data });
  if (cache.size > 200) cache.delete(cache.keys().next().value!);
  return data;
}
