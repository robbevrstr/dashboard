// Small, dependency-free helpers for pulling data out of retailer HTML.

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export class BlockedError extends Error {}

export async function fetchHtml(url: string, timeoutMs = 12000) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "nl-BE,nl;q=0.9,en;q=0.6",
    },
    redirect: "follow",
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (res.status === 403 || res.status === 429 || res.status === 503) {
    throw new BlockedError(`HTTP ${res.status}`);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return readCapped(res);
}

// Search pages are 1–3 MB; anything far bigger is a broken or hostile response.
const MAX_BYTES = 10 * 1024 * 1024;

async function readCapped(res: Response) {
  if (Number(res.headers.get("content-length") ?? 0) > MAX_BYTES) {
    throw new Error("Response too large");
  }
  if (!res.body) return "";
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      throw new Error("Response too large");
    }
    out += decoder.decode(value, { stream: true });
  }
  return out + decoder.decode();
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  euro: "€",
};

export function decodeEntities(s: string) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code =
        e[1] === "x" || e[1] === "X"
          ? parseInt(e.slice(2), 16)
          : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

export function text(html: string) {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " "),
  ).trim();
}

/** Parses "€ 1.299,99", "1.299,-", "949", "1299.00" into a number. */
export function parsePrice(raw: string | number | undefined): number | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : undefined;
  let s = raw.replace(/[^\d.,-]/g, "").replace(/,-$/, "").replace(/-$/, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/\.\d{3}$/.test(s)) s = s.replace(/\./g, "");
  const n = parseFloat(s);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function num(s: string) {
  return parseFloat(s.replace(/\./g, "").replace(",", "."));
}

export function absolute(url: string, base: string) {
  try {
    return new URL(decodeEntities(url), base).toString();
  } catch {
    return undefined;
  }
}

type Json = Record<string, unknown>;

/** Every schema.org Product found in the page's JSON-LD (incl. ItemLists and @graph). */
export function jsonLdProducts(html: string): Json[] {
  const out: Json[] = [];
  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(visit);
    const obj = node as Json;
    const type = JSON.stringify(obj["@type"] ?? "");
    if (type.includes('"Product"')) out.push(obj);
    if (obj["@graph"]) visit(obj["@graph"]);
    if (obj.itemListElement) visit(obj.itemListElement);
    if (obj.item) visit(obj.item);
    if (type.includes("ProductGroup") && obj.hasVariant) visit(obj.hasVariant);
  };
  const re =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of html.matchAll(re)) {
    try {
      visit(JSON.parse(m[1]));
    } catch {
      // ignore malformed blocks
    }
  }
  return out;
}

/** Converts a JSON-LD Product into the shared shape. */
export function fromJsonLd(p: Json, base: string) {
  const offers = [p.offers].flat()[0] as Json | undefined;
  const price = parsePrice(
    (offers?.price ?? offers?.lowPrice) as string | number | undefined,
  );
  const url = typeof p.url === "string" ? absolute(p.url, base) : undefined;
  const name = typeof p.name === "string" ? decodeEntities(p.name) : undefined;
  if (!price || !url || !name) return undefined;

  const img = [p.image].flat()[0] as string | Json | undefined;
  const image = typeof img === "string" ? img : (img?.url as string | undefined);

  const agg = p.aggregateRating as Json | undefined;
  let rating: { value: number; count: number } | undefined;
  if (agg?.ratingValue) {
    const best = Number(agg.bestRating ?? 5) || 5;
    const value = (Number(agg.ratingValue) / best) * 5;
    const count = Number(agg.reviewCount ?? agg.ratingCount ?? 0);
    if (Number.isFinite(value)) rating = { value, count };
  }

  const condition = String(offers?.itemCondition ?? "");
  return {
    title: name,
    url,
    image,
    price,
    rating,
    refurbished: /Refurbished|Used/i.test(condition),
  };
}
