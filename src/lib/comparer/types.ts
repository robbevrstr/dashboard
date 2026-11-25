// `domain` is the only site a result link from that shop may point to.
export const RETAILERS = {
  coolblue: { name: "Coolblue", domain: "coolblue.be" },
  bol: { name: "bol", domain: "bol.com" },
  mediamarkt: { name: "MediaMarkt", domain: "mediamarkt.be" },
  alternate: { name: "Alternate", domain: "alternate.be" },
  vandenborre: { name: "Vanden Borre", domain: "vandenborre.be" },
  amazon: { name: "Amazon.be", domain: "amazon.com.be" },
} as const;

export type RetailerId = keyof typeof RETAILERS;

/** Product images load in the visitor's browser, so only the shops' own image hosts are allowed (also in the CSP). */
export const IMAGE_HOSTS = [
  "coolblue.be",
  "coolblue.nl",
  "s-bol.com",
  "mmsrg.com",
  "alternate.be",
  "vandenborre.be",
  "media-amazon.com",
] as const;

export type Specs = {
  variant?: string;
  storage?: string;
  ram?: string;
  color?: string;
  screen?: string;
  battery?: string;
};

export type SpecKey = keyof Specs;

export type Offer = {
  id: string;
  retailer: RetailerId;
  title: string;
  url: string;
  image?: string;
  /** Price in euro. */
  price: number;
  /** Rating normalised to a 0–5 scale. */
  rating?: { value: number; count: number };
  condition: "new" | "refurbished";
  accessory: boolean;
  specs: Specs;
};

export type RetailerStatus = {
  retailer: RetailerId;
  status: "ok" | "empty" | "blocked" | "error";
  count: number;
};

export type HistoryPoint = {
  /** Unix time in ms. */
  at: number;
  /** Cheapest new product at that moment (or cheapest of any condition). */
  price: number;
  retailer: RetailerId;
};

export type SearchResponse = {
  query: string;
  fetchedAt: string;
  offers: Offer[];
  retailers: RetailerStatus[];
  /** Today's headline price: cheapest new product, else cheapest of any condition. */
  lowest?: number;
  history: HistoryPoint[];
};

/** What a retailer adapter returns before specs/relevance are applied. */
export type RawOffer = {
  title: string;
  url: string;
  image?: string;
  price: number;
  rating?: { value: number; count: number };
  /** Extra spec text (bullet lists, highlights) used for spec extraction. */
  details?: string[];
  refurbished?: boolean;
};
