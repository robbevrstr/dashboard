import { RETAILERS, type Offer } from "@/lib/comparer/types";
import { formatGap, formatPrice, SPEC_ORDER } from "./format";

type Props = {
  offer: Offer;
  lowest: number;
  highest: number;
  isLowest: boolean;
};

export function OfferRow({ offer, lowest, highest, isLowest }: Props) {
  const span = highest - lowest;
  const ratio = span > 0 ? (offer.price - lowest) / span : 0;
  const gap = offer.price - lowest;
  const specs = SPEC_ORDER.filter((k) => k !== "variant" && offer.specs[k]).map(
    (k) => (k === "ram" ? `${offer.specs[k]} RAM` : offer.specs[k]!),
  );

  return (
    <li>
      <a
        href={offer.url}
        target="_blank"
        rel="noopener noreferrer"
        className="group grid grid-cols-[56px_1fr] gap-x-4 gap-y-3 py-5 outline-none focus-visible:bg-accent/5 sm:grid-cols-[72px_1fr_auto]"
      >
        <div className="row-span-2 flex size-14 items-center justify-center overflow-hidden rounded-lg bg-white p-1.5 sm:row-span-1 sm:size-[72px]">
          {offer.image ? (
            // Retailer images come from many hosts; a plain img keeps this simple.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={offer.image}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              className="max-h-full max-w-full object-contain"
            />
          ) : null}
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className="font-medium">{RETAILERS[offer.retailer].name}</span>
            {offer.rating ? (
              <span className="text-muted">
                <span aria-hidden className="text-amber-500">★</span>{" "}
                {offer.rating.value.toFixed(1)}
                <span className="sr-only"> out of 5</span>
                {offer.rating.count ? ` (${offer.rating.count.toLocaleString("nl-BE")})` : ""}
              </span>
            ) : (
              <span className="text-muted">No reviews</span>
            )}
            {offer.condition === "refurbished" ? (
              <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                Refurbished
              </span>
            ) : null}
          </div>
          <h3 className="mt-1 line-clamp-2 leading-snug group-hover:underline group-hover:decoration-line group-hover:underline-offset-4">
            {offer.title}
          </h3>
          {specs.length ? (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {specs.map((s) => (
                <li key={s} className="rounded border border-line px-1.5 py-0.5 text-xs text-muted">
                  {s}
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="col-start-2 flex flex-col gap-2 sm:col-start-3 sm:row-start-1 sm:w-44 sm:items-end">
          <div className="flex items-baseline justify-between gap-3 sm:flex-col sm:items-end sm:gap-0.5">
            <span className="text-xl font-semibold tabular-nums tracking-tight">
              {formatPrice(offer.price)}
            </span>
            <span className={`text-sm tabular-nums ${isLowest ? "font-medium text-accent" : "text-muted"}`}>
              {isLowest ? "Lowest price" : `+${formatGap(gap)}`}
            </span>
          </div>
          {/* The ladder: how far this price sits above the cheapest one. */}
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-line" aria-hidden>
            <div
              className={`h-full rounded-full ${isLowest ? "bg-accent" : "bg-muted/60"}`}
              style={{ width: `${Math.max(4, ratio * 100)}%` }}
            />
          </div>
        </div>
      </a>
    </li>
  );
}
