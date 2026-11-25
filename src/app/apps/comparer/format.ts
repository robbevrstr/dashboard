import type { SpecKey } from "@/lib/comparer/types";

const eur = new Intl.NumberFormat("nl-BE", {
  style: "currency",
  currency: "EUR",
});
const eurRound = new Intl.NumberFormat("nl-BE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

export const formatPrice = (n: number) => eur.format(n);
export const formatGap = (n: number) => eurRound.format(n);

export const SPEC_LABELS: Record<SpecKey, string> = {
  variant: "Model",
  storage: "Storage",
  ram: "RAM",
  color: "Colour",
  screen: "Screen",
  battery: "Battery",
};

export const SPEC_ORDER: SpecKey[] = ["variant", "storage", "ram", "color", "screen", "battery"];

/** Sorts "128 GB" < "1 TB", "6.1″" < "6.7″", "Standard" first. */
export function compareSpec(a: string, b: string) {
  if (a === "Standard") return -1;
  if (b === "Standard") return 1;
  const size = (s: string) => {
    const m = s.match(/^([\d.]+)\s?(TB|GB|″|mAh)?/);
    if (!m) return NaN;
    return parseFloat(m[1]) * (m[2] === "TB" ? 1024 : 1);
  };
  const [x, y] = [size(a), size(b)];
  if (!Number.isNaN(x) && !Number.isNaN(y)) return x - y;
  return a.localeCompare(b);
}
