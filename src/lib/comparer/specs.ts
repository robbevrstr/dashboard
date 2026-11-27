// Turns free-text product titles (in Dutch, French or English) into
// comparable specs, and decides whether a listing matches the query.
import type { Specs } from "./types";

export function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function tokens(s: string) {
  return normalize(s).split(" ").filter(Boolean);
}

/** Every query word must appear as a whole word in the title. */
export function matchesQuery(title: string, query: string) {
  // Drop measurements like "16,5 cm" so "16" doesn't match a decimal.
  const t = ` ${normalize(title.replace(/\d+[.,]\d+/g, " "))} `;
  return tokens(query).every((tok) => t.includes(` ${tok} `));
}

// Matched inside words too, so "beschermhoes", "telefoonhoesje" and
// "lensbescherming" are all caught.
const ACCESSORY =
  /(hoes|case|cover|protector|screensaver|bescherm|tempered|gehard|glas|folie|lader|charger|kabel|cable|adapter|houder|holder|mount|strap|bandje|skin|sticker|pouch|sleeve|etui|coque|stylus|wallet|bumper|portemonnee|lanyard|koord|kussen|cushion|earpad|reparatie|repair|vervang|replacement|onderdeel|spare|hoofdband|dock)/;

/** Words that say a listing is made to fit another product, when they come before its name. */
const FITS = /\b(voor|for|pour|fur|compatible|compatibel)\b/;

/**
 * True for things *for* the product rather than the product itself
 * ("Hoesje geschikt voor iPhone 16"). An accessory added with "+" or "met"
 * ("Sony WH-1000XM5 + oplader") is a bundle and still counts as the product,
 * but only when the part before it is the product: in "BlueSwan met beschermhoes
 * voor MacBook Pro" the product is only named after the "met".
 */
export function isAccessory(title: string, query: string) {
  if (ACCESSORY.test(normalize(query))) return false;
  const full = normalize(title);
  const qt = tokens(query);
  // "Oorkussens voor Sony WH-1000XM5", "… Geschikt voor Google Pixel 10a": something *for* the
  // product. Only before its name: "MacBook Pro … ontworpen voor Apple Intelligence" is the product.
  const at = qt[0] ? ` ${full} `.indexOf(` ${qt[0]} `) : -1;
  if (at > 0 && FITS.test(full.slice(0, at))) return true;
  const head = normalize(title.split(/\s\+\s|\s(?:met|incl\.?|inclusief|with|avec)\s/i)[0]);
  const t = qt.length && qt.every((tok) => ` ${head} `.includes(` ${tok} `)) ? head : full;
  return ACCESSORY.test(t);
}

/**
 * Listings priced far below what the actual product costs are accessories that slipped
 * past the words above ("DockedByDesign SlideUnder Pro … MacBook Pro 14"). Compares with
 * the median of the listings still counted as the product; needs a few to be meaningful.
 */
export function cheapOutliers<T extends { price: number; accessory: boolean }>(offers: T[], query: string, ratio = 0.3) {
  if (ACCESSORY.test(normalize(query))) return;
  const prices = offers.filter((o) => !o.accessory).map((o) => o.price).sort((a, b) => a - b);
  if (prices.length < 4) return;
  const median = prices[Math.floor(prices.length / 2)];
  for (const o of offers) if (!o.accessory && o.price < median * ratio) o.accessory = true;
}

const COLORS: [string, RegExp][] = [
  ["Black", /\b(zwart|black|noir|schwarz|space black|midnight|middernacht|graphite|grafiet|onyx|obsidian|obsidiaan|jetblack|jet black)\b/],
  ["White", /\b(wit|white|blanc|weiss|starlight|sterrenlicht|cloud white|porcelain|ivory)\b/],
  ["Silver", /\b(zilver|silver|argent)\b/],
  ["Grey", /\b(grijs|gray|grey|gris|space gray|space grey)\b/],
  ["Blue", /\b(blauw|blue|bleu|ultramarine|outremer|navy|marine|azure)\b/],
  ["Green", /\b(groen|green|vert|teal|mint|sage|cyaan|cyan|groenblauw)\b/],
  ["Pink", /\b(roze|pink|rose|rosa)\b/],
  ["Red", /\b(rood|red|rouge|product red)\b/],
  ["Purple", /\b(paars|purple|violet|lavendel|lavender|lila)\b/],
  ["Yellow", /\b(geel|yellow|jaune)\b/],
  ["Orange", /\b(oranje|orange)\b/],
  ["Gold", /\b(goud|gold|or|champagne)\b/],
  ["Natural titanium", /\b(natural|naturel|natuurlijk)\b/],
  ["Desert titanium", /\b(desert|woestijn|zand|sand)\b/],
  ["Beige", /\b(beige|cream|creme|taupe)\b/],
];

const MODEL_WORDS = ["pro", "max", "plus", "ultra", "mini", "lite", "fe", "air", "slim", "neo", "edge", "fold", "flip", "xl"];

function gb(value: number, unit: string) {
  return unit.toLowerCase() === "tb" ? value * 1024 : value;
}

function label(size: number) {
  return size >= 1024 ? `${size / 1024} TB` : `${size} GB`;
}

export function extractSpecs(title: string, details: string[], query: string): Specs {
  const all = [title, ...details].join(" | ");
  const n = normalize(title);
  const specs: Specs = {};

  // RAM: "8GB RAM", "RAM: 8 GB", "Werkgeheugen: 8 GB", "8 GB werkgeheugen"
  const ram =
    all.match(/(?:ram|werkgeheugen|geheugen|memory)\s*:?\s*(\d{1,2})\s?gb/i) ??
    all.match(/(\d{1,2})\s?gb\s*(?:ram|werkgeheugen|lpddr\d*x?|ddr\d)/i);
  if (ram && Number(ram[1]) > 0) specs.ram = `${ram[1]} GB`;

  // Storage: the largest GB/TB size that isn't the RAM figure.
  const sizes = [...all.matchAll(/(\d{1,4})\s?(gb|tb)\b/gi)]
    .map((m) => gb(Number(m[1]), m[2]))
    .filter((v) => v >= 16 && String(v) + " GB" !== specs.ram);
  if (sizes.length) {
    const best = Math.max(...sizes);
    if (!specs.ram || best > parseInt(specs.ram)) specs.storage = label(best);
  }
  // "16GB/512GB" laptop style: small first value is RAM.
  const pair = all.match(/(\d{1,2})\s?gb\s?\/\s?(\d{3,4})\s?(gb|tb)/i);
  if (pair && !specs.ram) specs.ram = `${pair[1]} GB`;

  const screen = all.match(/(\d{1,2}(?:[.,]\d{1,2})?)\s?(?:inch|"|”|''|in\b)/i);
  if (screen) specs.screen = `${screen[1].replace(",", ".")}″`;

  const battery = all.match(/(\d{3,5})\s?mah/i);
  if (battery) specs.battery = `${battery[1]} mAh`;

  const color = COLORS.find(([, re]) => re.test(n));
  if (color) specs.color = color[0];

  // Model variant relative to the query: "iPhone 16" → Standard / Plus / Pro / Pro Max.
  const q = new Set(tokens(query));
  const words = n.split(" ");
  const variant = MODEL_WORDS.filter((w) => !q.has(w) && words.includes(w));
  const qt = tokens(query);
  const last = qt.at(-1);
  // "16e" style suffix glued to the model number.
  const glued = last ? words.find((w) => w !== last && w.startsWith(last) && /^[a-z]$/.test(w.slice(last.length))) : undefined;
  if (glued) variant.unshift(glued.slice(last!.length).toUpperCase());
  // "Galaxy S25+" — the plus sign is lost by normalize().
  if (last && !variant.includes("plus") && new RegExp(`\\b${last}\\s?\\+`, "i").test(title)) {
    variant.push("plus");
  }
  specs.variant = variant.length
    ? variant.map((w) => (w.length <= 2 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1))).join(" ")
    : "Standard";

  return specs;
}

export function isRefurbished(title: string) {
  return /\b(refurbished|refurb|tweedekans|reconditioned|renewed|gereviseerd|reconditionne|occasion|als nieuw|grade [abc])\b/i.test(
    normalize(title),
  );
}
