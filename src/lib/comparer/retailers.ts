// One adapter per shop. Each turns a search query into RawOffers.
// Shops change their markup now and then; every parser is defensive and an
// adapter that finds nothing just reports "empty" instead of failing the search.
import {
  absolute,
  BlockedError,
  decodeEntities,
  fetchHtml,
  fromJsonLd,
  jsonLdProducts,
  num,
  parsePrice,
  text,
} from "./html";
import { renderHtml } from "./browser";
import type { RawOffer, RetailerId } from "./types";

type Adapter = (query: string) => Promise<RawOffer[]>;

const q = encodeURIComponent;

function present<T>(x: T | undefined): x is T {
  return x !== undefined;
}

// ---------- Coolblue ----------
const COOLBLUE = "https://www.coolblue.be";

const coolblue: Adapter = async (query) => {
  const html = await fetchHtml(`${COOLBLUE}/nl/zoeken?query=${q(query)}`);
  const cards = html.split(/class="product-card[\s"]/).slice(1);
  // Some cards render their photo client-side; the page's product data still has it.
  const imageByUrl = new Map<string, string>();
  for (const m of html.matchAll(
    /"url":"(https:\/\/www\.coolblue\.be\/nl\/product\/\d+\/[^"]+)","image":\["(https:\/\/image\.coolblue\.be\/[^"]+)"/g,
  )) {
    imageByUrl.set(m[1], m[2]);
  }

  const offers = cards
    .map((card): RawOffer | undefined => {
      const link = card.match(
        /<a[^>]*href="((?:https:\/\/www\.coolblue\.be)?\/nl\/product\/\d+\/[^"]+)"[^>]*>([^<]{3,})<\/a>/,
      );
      if (!link) return undefined;
      // Prices after the "Tweedekans" link belong to the second-hand offer.
      const main = card.split("product-tweedekans")[0].replace(/<!-- -->/g, "");
      const prices = [...main.matchAll(/>\s*(\d{1,3}(?:\.\d{3})*),(-|\d{2})\s*</g)]
        .map((m) => parsePrice(`${m[1]},${m[2]}`))
        .filter(present);
      if (!prices.length) return undefined;

      const r = card.match(
        /Beoordeling is ([\d,]+) van de 10, gebaseerd op ([\d.]+) review/,
      );
      const img = card.match(/src="(https:\/\/image\.coolblue\.be\/[^"]*\/products\/\d+)"/);
      const highlights = [...card.matchAll(/<span[^>]*>([^<|]{2,60})<\/span>/g)]
        .map((m) => decodeEntities(m[1]).trim())
        .slice(0, 12);

      const url = absolute(link[1], COOLBLUE)!;
      return {
        title: decodeEntities(link[2]).trim(),
        url,
        image: img?.[1] ?? imageByUrl.get(url),
        price: Math.min(...prices),
        rating: r ? { value: num(r[1]) / 2, count: num(r[2]) } : undefined,
        details: highlights,
      };
    })
    .filter(present);
  if (offers.length) return offers;

  // Some queries redirect to a model landing page without product cards.
  // Fall back to the product pages linked from it, which carry JSON-LD.
  const urls = [
    ...new Set(
      [...html.matchAll(/https:\/\/www\.coolblue\.be\/nl\/product\/\d+\/[a-z0-9-]+\.html/g)].map(
        (m) => m[0],
      ),
    ),
  ].slice(0, 10);
  const pages = await Promise.allSettled(urls.map((u) => fetchHtml(u)));
  return pages
    .flatMap((p) => (p.status === "fulfilled" ? jsonLdProducts(p.value) : []))
    .map((p) => fromJsonLd(p, COOLBLUE))
    .filter(present);
};

// ---------- bol ----------
const BOL = "https://www.bol.com";

const bol: Adapter = async (query) => {
  const html = await fetchHtml(`${BOL}/be/nl/s/?searchtext=${q(query)}`);
  // The page embeds offer JSON (escaped) that says which listings are refurbished.
  const conditions = new Map<string, string>();
  for (const m of html.matchAll(
    /url\\*":\\*"https:\/\/www\.bol\.com(\/be\/nl\/p\/[^"\\]+)\\*"[^{}]*?itemCondition\\*":\\*"https:\/\/schema\.org\/(\w+?)Condition/g,
  )) {
    conditions.set(m[1], m[2]);
  }
  // Each product title is an <h2>; the link and image sit just before it.
  const parts = html.split(/<h2[\s>]/).map((p) => p.split("<script")[0]);
  return parts
    .slice(1)
    .map((part, i): RawOffer | undefined => {
      // Everything since the previous title; its last link/image belong to this tile.
      const before = parts[i];
      const links = [...before.matchAll(/href="(\/be\/nl\/p\/[^"]+\/\d+\/)[^"]*"/g)];
      const href = links.at(-1)?.[1];
      const price = part.match(
        /De prijs van dit product is &#x27;(\d+)&#x27; euro en &#x27;(\d+)&#x27; cent/,
      );
      if (!href || !price) return undefined;

      const titleEnd = part.indexOf("</h2>");
      const title = text(part.slice(0, titleEnd).replace(/^[^>]*>/, ""));
      const r = part.match(/Gemiddeld ([\d.]+) van de 5 sterren uit (\d+) review/);
      // Product photos are large .jpg's; skip small banners like the "Nieuw" .png.
      const imgs = [
        ...before.matchAll(/src="(https:\/\/media\.s-bol\.com\/[^"]+\/\d{3,}x\d{3,}\.(?:jpe?g|webp))"/g),
      ];
      const bullets = [...part.matchAll(/<li[^>]*>([^<]{2,80})<\/li>/g)].map((m) =>
        decodeEntities(m[1]).trim(),
      );

      return {
        title,
        url: BOL + href,
        image: imgs.at(-1)?.[1],
        price: Number(price[1]) + Number(price[2]) / 100,
        rating: r ? { value: Number(r[1]), count: Number(r[2]) } : undefined,
        details: bullets,
        refurbished:
          /Refurbished|Used/.test(conditions.get(href) ?? "") ||
          /<span[^>]*>\s*Refurbished\s*<\/span>/.test(part),
      };
    })
    .filter(present);
};

// ---------- MediaMarkt ----------
const MEDIAMARKT = "https://www.mediamarkt.be";

const mediamarkt: Adapter = async (query) => {
  const html = await fetchHtml(`${MEDIAMARKT}/nl/search.html?query=${q(query)}`);
  return jsonLdProducts(html)
    .map((p) => fromJsonLd(p, MEDIAMARKT))
    .filter(present);
};

// ---------- Alternate ----------
const ALTERNATE = "https://www.alternate.be";

const alternate: Adapter = async (query) => {
  const html = await fetchHtml(`${ALTERNATE}/listing.xhtml?q=${q(query)}`);
  const boxes = [...html.matchAll(/<a href="([^"]+)" class="[^"]*productBox[^"]*"/g)];
  return boxes
    .map((m, i): RawOffer | undefined => {
      const box = html.slice(m.index, boxes[i + 1]?.index ?? m.index + 8000);
      const name = box.match(/class="product-name[^"]*">([\s\S]*?)<\/div>/);
      const sub = box.match(/class="product-name-sub">([^<]*)</);
      const price = parsePrice(box.match(/class="price[^"]*">([^<]+)</)?.[1]);
      if (!name || !price) return undefined;

      const r = box.match(/aria-description="([\d.]+) sterren Gebaseerd op (\d+) review/);
      const imgSrc = box.match(/<img src="([^"]+)"[^>]*class="productPicture/)?.[1];
      const bullets = [...box.matchAll(/<li>([^<]{2,100})<\/li>/g)].map((b) =>
        decodeEntities(b[1]).trim(),
      );
      const title = [text(name[1]), sub ? text(sub[1]) : ""].filter(Boolean).join(" ");

      return {
        title,
        url: absolute(m[1], ALTERNATE)!,
        image: imgSrc ? absolute(imgSrc, ALTERNATE) : undefined,
        price,
        rating: r ? { value: Number(r[1]), count: Number(r[2]) } : undefined,
        details: bullets,
      };
    })
    .filter(present);
};

// ---------- Vanden Borre ----------
// Results are filled in by JavaScript after load, so the page is rendered in Chrome.
const VDB = "https://www.vandenborre.be";

const vandenborre: Adapter = async (query) => {
  const html = await renderHtml(`${VDB}/zoekresultaat?query=${q(query)}`, {
    waitFor: '[data-gtm-list="search-product-list"]',
    timeoutMs: 15000,
  });
  return html
    .split(/class="[^"]*js-product-container/)
    .slice(1)
    .filter((tile) => tile.slice(0, 1500).includes('data-gtm-list="search-product-list"'))
    .map((tile): RawOffer | undefined => {
      // Each tile carries its own analytics JSON with price and rating.
      const json = tile.match(/class="js-analytics-item">(\{[^<]*\})</)?.[1];
      let data: { price?: number; item_rating?: number; item_reviews?: number } = {};
      try {
        data = json ? JSON.parse(json) : {};
      } catch {}
      const href = tile.match(/<a href="([^"]+)"[^>]*class="js-product-click/)?.[1];
      const name = tile.match(/class="productname(?! productfamily)[^"]*"[^>]*>([^<]+)</)?.[1];
      // The analytics price is the reference price; the shown "current" price includes discounts.
      const price =
        parsePrice(tile.match(/class="current[^"]*">([^<]+)</)?.[1]) ??
        parsePrice(data.price);
      if (!href || !name || !price) return undefined;

      const img = tile.match(/src="(\/\/image\.vandenborre\.be\/[^"]+)"/)?.[1];
      const bullets = [...tile.matchAll(/<li[^>]*>([^<]{2,100})<\/li>/g)].map((m) =>
        decodeEntities(m[1]).trim(),
      );
      return {
        // Titles are all caps ("GOOGLE PIXEL 10a 128GB"); soften words without digits.
        title: decodeEntities(name)
          .replace(/\s+/g, " ")
          .trim()
          .replace(/\b([A-ZÀ-Ý])([A-ZÀ-Ý]{2,})\b/g, (_, a: string, b: string) => a + b.toLowerCase())
          .replace(/\bIphone\b/g, "iPhone")
          .replace(/\bIpad\b/g, "iPad"),
        url: absolute(href, VDB)!,
        image: img ? `https:${img}` : undefined,
        price,
        rating: data.item_rating
          ? { value: data.item_rating, count: data.item_reviews ?? 0 }
          : undefined,
        details: bullets,
      };
    })
    .filter(present);
};

// ---------- Amazon.be ----------
const AMAZON = "https://www.amazon.com.be";

const amazon: Adapter = async (query) => {
  const url = `${AMAZON}/s?k=${q(query)}&language=nl_BE`;
  const hasResults = (h: string) =>
    h.includes("s-search-result") || /Geen resultaten|No results/i.test(h);
  // Plain requests are fast but often get a bot page; a real browser usually gets through.
  let html = await fetchHtml(url).catch(() => "");
  if (!hasResults(html)) {
    html = await renderHtml(url, { waitFor: '[data-component-type="s-search-result"]' });
  }
  if (!hasResults(html)) throw new BlockedError("no search results page");
  return html
    .split(/data-component-type="s-search-result"/)
    .slice(1)
    .map((part): RawOffer | undefined => {
      const asin = part.match(/\/dp\/([A-Z0-9]{10})/)?.[1];
      const title =
        part.match(/<h2[^>]*aria-label="([^"]+)"/)?.[1] ??
        part.match(/<h2[\s\S]*?<span[^>]*>([^<]+)</)?.[1];
      const price = parsePrice(part.match(/class="a-offscreen">([^<]+)</)?.[1]);
      if (!asin || !title || !price) return undefined;

      const stars = part.match(/([\d,]+) van 5 sterren/);
      const count = part.match(/aria-label="([\d.]+) beoordelingen"/);
      const img = part.match(/class="s-image"[^>]*src="([^"]+)"|src="([^"]+)"[^>]*class="s-image"/);

      return {
        title: decodeEntities(title).replace(/^Gesponsorde? (advertentie )?[-:–]\s*/i, ""),
        url: `${AMAZON}/dp/${asin}`,
        image: img?.[1] ?? img?.[2],
        price,
        rating: stars
          ? { value: num(stars[1]), count: count ? num(count[1]) : 0 }
          : undefined,
        refurbished: /renewed|refurbished|gereviseerd/i.test(title),
      };
    })
    .filter(present);
};

export const adapters: Record<RetailerId, Adapter> = {
  coolblue,
  bol,
  mediamarkt,
  alternate,
  vandenborre,
  amazon,
};
