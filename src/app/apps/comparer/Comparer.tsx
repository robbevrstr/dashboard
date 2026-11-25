"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LineChart } from "@/components/LineChart";
import { loadSetting, saveSetting } from "@/lib/store";
import {
  RETAILERS,
  type Offer,
  type RetailerId,
  type RetailerStatus,
  type SearchResponse,
  type SpecKey,
} from "@/lib/comparer/types";
import { compareSpec, formatGap, formatPrice, SPEC_LABELS, SPEC_ORDER } from "./format";
import { OfferRow } from "./OfferRow";

type Alert = { kind: "drop" | "target"; from?: number; to: number };
type Saved = {
  query: string;
  lowest?: number;
  checkedAt?: string;
  /** Alert when the price is at or below this. */
  target?: number;
  /** Unseen price alert; cleared when the item is opened. */
  alert?: Alert;
};

const RECHECK_AFTER_MS = 6 * 60 * 60 * 1000;

/** Updates one saved item with a fresh result and decides whether that's alert-worthy. */
function withResult(item: Saved, result: SearchResponse): Saved {
  const lowest = result.lowest;
  let alert = item.alert;
  if (lowest !== undefined) {
    if (item.target !== undefined && lowest <= item.target && (item.lowest ?? Infinity) > item.target) {
      alert = { kind: "target", from: item.lowest, to: lowest };
    } else if (item.lowest !== undefined && lowest < item.lowest - 0.5) {
      alert = { kind: "drop", from: item.lowest, to: lowest };
    }
  }
  return { ...item, lowest, checkedAt: result.fetchedAt, alert };
}

function notify(item: Saved) {
  if (!item.alert || typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const { kind, from, to } = item.alert;
  const body =
    kind === "target"
      ? `Now ${formatPrice(to)}, at or below your ${formatPrice(item.target!)} target.`
      : `Down from ${formatPrice(from!)} to ${formatPrice(to)}.`;
  try {
    new Notification(`${item.query}: price ${kind === "target" ? "target reached" : "dropped"}`, { body });
  } catch {
    // some browsers only allow notifications from a service worker
  }
}
type Sort = "price" | "rating";
type Condition = "new" | "refurbished";

type Filters = {
  shops: Set<RetailerId>;
  specs: Partial<Record<SpecKey, Set<string>>>;
  conditions: Set<Condition>;
  minRating: number;
  maxPrice?: number;
  accessories: boolean;
};

const STORAGE_KEY = "comparer:saved";
const emptyFilters = (): Filters => ({
  shops: new Set(),
  specs: {},
  conditions: new Set(),
  minRating: 0,
  accessories: false,
});

async function loadSaved(): Promise<Saved[]> {
  const list = await loadSetting(STORAGE_KEY, Array.isArray);
  return list ? (list as Saved[]).filter((s) => typeof s?.query === "string") : [];
}

function storeSaved(list: Saved[]) {
  saveSetting(STORAGE_KEY, list);
}

function toggle<T>(set: Set<T>, value: T) {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

export function Comparer() {
  const [saved, setSaved] = useState<Saved[]>([]);
  const [input, setInput] = useState("");
  const [active, setActive] = useState<string>();
  const [data, setData] = useState<SearchResponse>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [sort, setSort] = useState<Sort>("price");

  // Filters start open on wide screens and collapsed on phones.
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    const wide = window.matchMedia("(min-width: 1024px)").matches;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- depends on the screen, known only in the browser
    setFiltersOpen(wide);
    let live = true;
    loadSaved().then((list) => {
      // Keep anything added while the list was loading.
      if (live) setSaved((prev) => [...prev, ...list.filter((s) => !prev.some((p) => p.query === s.query))]);
    });
    return () => {
      live = false;
    };
  }, []);

  // Latest list for async code that outlives a render.
  const savedRef = useRef(saved);
  useEffect(() => {
    savedRef.current = saved;
  }, [saved]);

  function updateSaved(fn: (prev: Saved[]) => Saved[]) {
    setSaved((prev) => {
      const next = fn(prev);
      storeSaved(next);
      return next;
    });
  }

  async function fetchResult(q: string) {
    const res = await fetch(`/api/comparer?q=${encodeURIComponent(q)}`);
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? "The search failed.");
    return body as SearchResponse;
  }

  async function compare(query: string) {
    const q = query.trim();
    if (q.length < 2) return;
    setActive(q);
    setLoading(true);
    setError(undefined);
    setFilters(emptyFilters());
    try {
      const result = await fetchResult(q);
      setData(result);
      updateSaved((prev) => {
        const existing = prev.find((s) => s.query.toLowerCase() === q.toLowerCase());
        const rest = prev.filter((s) => s !== existing);
        // Opening an item counts as seeing its alert.
        const item = { ...withResult(existing ?? { query: q }, result), alert: undefined };
        return [item, ...rest].slice(0, 12);
      });
    } catch (e) {
      setData(undefined);
      setError(e instanceof Error ? e.message : "The search failed.");
    } finally {
      setLoading(false);
    }
  }

  // A search started elsewhere (the dashboard's watchlist) arrives as ?q=…; run it once.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q")?.trim();
    if (!q) return;
    window.history.replaceState(null, "", window.location.pathname);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the query only exists in the URL
    setInput(q);
    compare(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival
  }, []);

  // Re-check saved items in the background, one at a time, and raise alerts.
  const [checking, setChecking] = useState<string>();
  async function recheck(items: Saved[]) {
    for (const item of items) {
      setChecking(item.query);
      try {
        const result = await fetchResult(item.query);
        const current = savedRef.current.find((s) => s.query === item.query);
        if (!current) continue; // removed while we were checking
        const updated = withResult(current, result);
        updateSaved((prev) => prev.map((s) => (s.query === item.query ? withResult(s, result) : s)));
        if (updated.alert && updated.alert !== current.alert) notify(updated);
      } catch {
        break; // rate limited or offline: try again next visit
      }
    }
    setChecking(undefined);
  }

  // On first load, refresh items that haven't been checked for a while.
  const rechecked = useRef(false);
  useEffect(() => {
    if (rechecked.current || !saved.length) return;
    rechecked.current = true;
    const stale = saved.filter(
      (s) => !s.checkedAt || Date.now() - Date.parse(s.checkedAt) > RECHECK_AFTER_MS,
    );
    // eslint-disable-next-line react-hooks/set-state-in-effect -- kicks off async background work
    if (stale.length) recheck(stale.slice(0, 8));
  }, [saved]); // eslint-disable-line react-hooks/exhaustive-deps

  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("unsupported");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read browser capability once
    setPermission(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  }, []);

  function remove(query: string) {
    updateSaved((prev) => prev.filter((s) => s.query !== query));
  }

  function setTarget(query: string, target: number | undefined) {
    updateSaved((prev) => prev.map((s) => (s.query === query ? { ...s, target } : s)));
  }

  const activeItem = saved.find((s) => s.query.toLowerCase() === active?.toLowerCase());

  // Offers the facets are built from: everything except accessories (unless shown).
  const base = useMemo(
    () => (data?.offers ?? []).filter((o) => filters.accessories || !o.accessory),
    [data, filters.accessories],
  );

  const facets = useMemo(() => {
    const out: { key: SpecKey; values: [string, number][] }[] = [];
    for (const key of SPEC_ORDER) {
      const counts = new Map<string, number>();
      for (const o of base) {
        const v = o.specs[key];
        if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
      }
      // Only offer a filter when there's an actual choice to make.
      if (counts.size >= 2) {
        out.push({ key, values: [...counts].sort((a, b) => compareSpec(a[0], b[0])) });
      }
    }
    return out;
  }, [base]);

  const shopCounts = useMemo(() => {
    const counts = new Map<RetailerId, number>();
    for (const o of base) counts.set(o.retailer, (counts.get(o.retailer) ?? 0) + 1);
    return counts;
  }, [base]);

  const hasRefurbished = base.some((o) => o.condition === "refurbished");
  const accessoryCount = (data?.offers ?? []).filter((o) => o.accessory).length;

  const visible = useMemo(() => {
    const list = base.filter((o: Offer) => {
      if (filters.shops.size && !filters.shops.has(o.retailer)) return false;
      if (filters.conditions.size && !filters.conditions.has(o.condition)) return false;
      if (filters.minRating && (o.rating?.value ?? 0) < filters.minRating) return false;
      if (filters.maxPrice && o.price > filters.maxPrice) return false;
      for (const [key, set] of Object.entries(filters.specs) as [SpecKey, Set<string>][]) {
        if (set.size && !set.has(o.specs[key] ?? "")) return false;
      }
      return true;
    });
    if (sort === "rating") {
      return [...list].sort(
        (a, b) =>
          (b.rating?.value ?? 0) - (a.rating?.value ?? 0) ||
          (b.rating?.count ?? 0) - (a.rating?.count ?? 0) ||
          a.price - b.price,
      );
    }
    return [...list].sort((a, b) => a.price - b.price);
  }, [base, filters, sort]);

  const prices = visible.map((o) => o.price);
  const lowest = prices.length ? Math.min(...prices) : 0;
  const highest = prices.length ? Math.max(...prices) : 0;
  const activeFilterCount =
    filters.shops.size +
    filters.conditions.size +
    (filters.minRating ? 1 : 0) +
    (filters.maxPrice ? 1 : 0) +
    Object.values(filters.specs).reduce((n, s) => n + (s?.size ?? 0), 0);

  return (
    <div className="pb-20">
      <form
        className="mt-8 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          compare(input);
          setInput("");
        }}
      >
        <label htmlFor="item" className="sr-only">
          What do you want to buy?
        </label>
        <input
          id="item"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="What do you want to buy? e.g. iPhone 16, Sony WH-1000XM5"
          autoComplete="off"
          maxLength={80}
          className="h-12 flex-1 rounded-lg border border-line bg-surface px-4 text-base outline-none placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/25"
        />
        <button
          type="submit"
          disabled={loading || input.trim().length < 2}
          className="h-12 rounded-md bg-accent px-6 font-medium text-background outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40"
        >
          Add and compare
        </button>
      </form>

      {saved.length ? (
        <section aria-label="Your list" className="mt-6">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <h2 className="text-muted">Your list</h2>
            <button
              type="button"
              onClick={() => recheck(saved)}
              disabled={!!checking || loading}
              className="text-accent underline-offset-4 hover:underline disabled:text-muted disabled:no-underline"
            >
              {checking ? `Checking ${checking}…` : "Check all prices now"}
            </button>
            {permission === "default" ? (
              <button
                type="button"
                onClick={async () => setPermission(await Notification.requestPermission())}
                className="text-accent underline-offset-4 hover:underline"
              >
                Notify me about price drops
              </button>
            ) : null}
          </div>
          <ul className="mt-2 flex flex-wrap gap-2">
            {saved.map((s) => {
              const isActive = s.query.toLowerCase() === active?.toLowerCase();
              return (
                <li
                  key={s.query}
                  className={`flex items-center rounded-lg border text-sm ${
                    isActive
                      ? "border-accent bg-accent/10"
                      : s.alert
                        ? "border-amber-500/60 bg-amber-500/10"
                        : "border-line bg-surface"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => compare(s.query)}
                    className="rounded-l-lg py-1.5 pr-2 pl-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    aria-current={isActive || undefined}
                  >
                    <span className="font-medium">{s.query}</span>
                    {s.lowest ? (
                      <span className="ml-2 text-muted tabular-nums">from {formatPrice(s.lowest)}</span>
                    ) : null}
                    {s.alert ? (
                      <span className="ml-2 font-medium text-amber-700 tabular-nums dark:text-amber-300">
                        {s.alert.kind === "target"
                          ? "Target reached"
                          : `Down ${formatGap((s.alert.from ?? s.alert.to) - s.alert.to)}`}
                      </span>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(s.query)}
                    aria-label={`Remove ${s.query} from your list`}
                    className="rounded-r-lg px-2 py-1.5 text-muted outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <div aria-live="polite">
        {loading ? <Loading query={active} /> : null}
        {!loading && error ? (
          <p className="mt-10 rounded-lg border border-red-500/30 bg-red-500/5 p-4 text-sm">{error}</p>
        ) : null}
        {!loading && !error && !data ? <Empty hasSaved={saved.length > 0} /> : null}
      </div>

      {!loading && data ? (
        <div className="mt-10 grid gap-10 lg:grid-cols-[220px_1fr]">
          <aside>
            <details
              className="group"
              open={filtersOpen}
              onToggle={(e) => setFiltersOpen(e.currentTarget.open)}
            >
              <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg border border-line px-3 py-2 text-sm font-medium lg:hidden">
                Filters{activeFilterCount ? ` (${activeFilterCount})` : ""}
                <span aria-hidden className="transition-transform group-open:rotate-180">⌄</span>
              </summary>
              <div className="mt-4 space-y-7 lg:mt-0">
                <FilterGroup title="Shop">
                  {data.retailers.map((r) => (
                    <Check
                      key={r.retailer}
                      label={RETAILERS[r.retailer].name}
                      count={shopCounts.get(r.retailer) ?? 0}
                      checked={filters.shops.has(r.retailer)}
                      disabled={!shopCounts.get(r.retailer)}
                      onChange={() => setFilters((f) => ({ ...f, shops: toggle(f.shops, r.retailer) }))}
                    />
                  ))}
                </FilterGroup>

                {facets.map(({ key, values }) => (
                  <FilterGroup key={key} title={SPEC_LABELS[key]}>
                    <div className="flex flex-wrap gap-1.5">
                      {values.map(([value, count]) => {
                        const on = filters.specs[key]?.has(value) ?? false;
                        return (
                          <Chip
                            key={value}
                            on={on}
                            onClick={() =>
                              setFilters((f) => ({
                                ...f,
                                specs: { ...f.specs, [key]: toggle(f.specs[key] ?? new Set(), value) },
                              }))
                            }
                          >
                            {value} <span className="text-muted">{count}</span>
                          </Chip>
                        );
                      })}
                    </div>
                  </FilterGroup>
                ))}

                {hasRefurbished ? (
                  <FilterGroup title="Condition">
                    <div className="flex flex-wrap gap-1.5">
                      {(["new", "refurbished"] as const).map((c) => (
                        <Chip
                          key={c}
                          on={filters.conditions.has(c)}
                          onClick={() => setFilters((f) => ({ ...f, conditions: toggle(f.conditions, c) }))}
                        >
                          {c === "new" ? "New" : "Refurbished"}
                        </Chip>
                      ))}
                    </div>
                  </FilterGroup>
                ) : null}

                <FilterGroup title="Reviews">
                  <div className="flex flex-wrap gap-1.5">
                    {[0, 4, 4.5].map((r) => (
                      <Chip
                        key={r}
                        on={filters.minRating === r}
                        onClick={() => setFilters((f) => ({ ...f, minRating: r }))}
                      >
                        {r ? `${r}★ and up` : "Any"}
                      </Chip>
                    ))}
                  </div>
                </FilterGroup>

                <FilterGroup title="Maximum price">
                  <div className="flex items-center rounded-lg border border-line bg-surface focus-within:border-accent">
                    <span className="pl-3 text-muted">€</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      placeholder="No limit"
                      value={filters.maxPrice ?? ""}
                      onChange={(e) =>
                        setFilters((f) => ({
                          ...f,
                          maxPrice: e.target.value ? Number(e.target.value) : undefined,
                        }))
                      }
                      className="h-9 w-full bg-transparent px-2 text-sm tabular-nums outline-none"
                      aria-label="Maximum price in euro"
                    />
                  </div>
                </FilterGroup>

                {accessoryCount ? (
                  <Check
                    label="Show accessories"
                    count={accessoryCount}
                    checked={filters.accessories}
                    onChange={() => setFilters((f) => ({ ...f, accessories: !f.accessories }))}
                  />
                ) : null}

                {activeFilterCount ? (
                  <button
                    type="button"
                    onClick={() => setFilters((f) => ({ ...emptyFilters(), accessories: f.accessories }))}
                    className="text-sm text-accent underline-offset-4 hover:underline"
                  >
                    Clear filters
                  </button>
                ) : null}
              </div>
            </details>
          </aside>

          <section aria-label="Results" className="min-w-0">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-4">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">{data.query}</h2>
                <p className="mt-1 text-sm text-muted">
                  {visible.length
                    ? `${visible.length} ${visible.length === 1 ? "offer" : "offers"}, ${formatPrice(lowest)} to ${formatPrice(highest)}`
                    : "No offers match these filters"}
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <span className="text-muted">Sort by</span>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as Sort)}
                  className="rounded-lg border border-line bg-surface px-2 py-1.5 outline-none focus:border-accent"
                >
                  <option value="price">Price, low to high</option>
                  <option value="rating">Best reviewed</option>
                </select>
              </label>
            </div>

            <ShopStatus retailers={data.retailers} />

            <History
              key={data.query}
              data={data}
              target={activeItem?.target}
              onTarget={(t) => activeItem && setTarget(activeItem.query, t)}
            />

            {visible.length ? (
              <ol className="divide-y divide-line">
                {visible.map((o) => (
                  <OfferRow
                    key={o.id}
                    offer={o}
                    lowest={lowest}
                    highest={highest}
                    isLowest={o.price === lowest}
                  />
                ))}
              </ol>
            ) : (
              <p className="py-12 text-muted">
                {data.offers.length
                  ? "Nothing left after filtering. Loosen a filter or clear them all."
                  : "None of the shops sell something matching this name. Check the spelling or try a shorter name, like the model number."}
              </p>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}

const shortDate = (t: number) =>
  new Date(t).toLocaleDateString("nl-BE", { day: "numeric", month: "short", year: "numeric" });

function History({
  data,
  target,
  onTarget,
}: {
  data: SearchResponse;
  target?: number;
  onTarget: (target: number | undefined) => void;
}) {
  const [draft, setDraft] = useState(target ? String(target) : "");
  const points = data.history;
  if (data.lowest === undefined) return null;

  const checkedAt = Date.parse(data.fetchedAt);
  const lowestSeen = points.reduce(
    (a, b) => (b.price < a.price ? b : a),
    points[0] ?? { price: data.lowest, at: checkedAt },
  );
  const isLowest = points.length > 1 && data.lowest <= lowestSeen.price;
  const saved = target !== undefined && String(target) === draft;

  return (
    <section aria-label="Price history" className="mt-6 panel p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <div>
          <h3 className="font-medium">Price history</h3>
          <p className="mt-0.5 text-sm text-muted">Cheapest new product across all shops, each time it was checked.</p>
        </div>
        <dl className="flex gap-6 text-sm">
          <div>
            <dt className="text-muted">Now</dt>
            <dd className="font-semibold tabular-nums">{formatPrice(data.lowest)}</dd>
          </div>
          <div>
            <dt className="text-muted">Lowest seen</dt>
            <dd className="font-semibold tabular-nums">
              {formatPrice(lowestSeen.price)}
              {isLowest ? <span className="ml-1.5 font-medium text-accent">today</span> : null}
            </dd>
          </div>
        </dl>
      </div>

      <div className="mt-4">
        {points.length > 1 ? (
          <LineChart
            label={`Lowest price for ${data.query} from ${shortDate(points[0].at)} to ${shortDate(points.at(-1)!.at)}, between ${formatPrice(Math.min(...points.map((p) => p.price)))} and ${formatPrice(Math.max(...points.map((p) => p.price)))}`}
            series={[
              {
                id: "lowest",
                label: "Lowest",
                color: "var(--accent)",
                points: points.map((p) => ({ t: p.at, v: p.price })),
              },
            ]}
            formatValue={(v) => formatGap(v)}
            height={180}
            step
          />
        ) : (
          <p className="rounded-lg bg-background px-3 py-4 text-sm text-muted">
            Tracking started {shortDate(points[0]?.at ?? checkedAt)}. A chart appears once this item has been checked
            more than once; items on your list are re-checked automatically when you visit.
          </p>
        )}
      </div>

      <form
        className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4 text-sm"
        onSubmit={(e) => {
          e.preventDefault();
          const n = Number(draft.replace(",", "."));
          onTarget(draft && n > 0 ? n : undefined);
        }}
      >
        <label htmlFor="target" className="text-muted">
          Alert me at or below
        </label>
        <div className="flex items-center rounded-lg border border-line bg-background focus-within:border-accent">
          <span className="pl-2.5 text-muted">€</span>
          <input
            id="target"
            inputMode="decimal"
            value={draft}
            onChange={(e) => setDraft(e.target.value.replace(/[^\d.,]/g, ""))}
            placeholder={String(Math.floor(data.lowest * 0.9))}
            className="h-8 w-24 bg-transparent px-1.5 tabular-nums outline-none"
          />
        </div>
        <button
          type="submit"
          className="h-8 rounded-lg border border-line px-3 font-medium outline-none hover:border-muted focus-visible:ring-2 focus-visible:ring-accent"
        >
          {saved ? "Saved" : "Set alert"}
        </button>
        {target !== undefined ? (
          <button
            type="button"
            onClick={() => {
              setDraft("");
              onTarget(undefined);
            }}
            className="text-muted underline-offset-4 hover:text-foreground hover:underline"
          >
            Remove alert
          </button>
        ) : null}
      </form>
    </section>
  );
}

function ShopStatus({ retailers }: { retailers: RetailerStatus[] }) {
  const down = retailers.filter((r) => r.status === "blocked" || r.status === "error");
  if (!down.length) return null;
  return (
    <p className="mt-4 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
      {down.map((r) => RETAILERS[r.retailer].name).join(" and ")} didn&apos;t respond this time, so{" "}
      {down.length === 1 ? "its" : "their"} prices are missing. Search again in a minute to retry.
    </p>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-2.5 text-sm font-medium">{title}</legend>
      <div className="space-y-1.5">{children}</div>
    </fieldset>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`rounded-md border px-2 py-1 text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-accent ${
        on ? "border-accent bg-accent/10" : "border-line bg-surface hover:border-muted"
      }`}
    >
      {children}
    </button>
  );
}

function Check(props: {
  label: string;
  count: number;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
}) {
  return (
    <label className={`flex items-center gap-2.5 text-sm ${props.disabled ? "opacity-40" : "cursor-pointer"}`}>
      <input
        type="checkbox"
        checked={props.checked}
        disabled={props.disabled}
        onChange={props.onChange}
        className="size-4 accent-[var(--accent)]"
      />
      <span className="flex-1">{props.label}</span>
      <span className="text-muted tabular-nums">{props.count}</span>
    </label>
  );
}

function Loading({ query }: { query?: string }) {
  return (
    <div className="mt-10">
      <p className="text-sm text-muted">
        Checking {Object.keys(RETAILERS).length} shops for {query}. This takes a few seconds.
      </p>
      <ul className="mt-6 divide-y divide-line" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <li key={i} className="flex gap-4 py-5">
            <div className="size-14 animate-pulse rounded-lg bg-line motion-reduce:animate-none" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-24 animate-pulse rounded bg-line motion-reduce:animate-none" />
              <div className="h-4 w-3/4 animate-pulse rounded bg-line motion-reduce:animate-none" />
            </div>
            <div className="h-6 w-20 animate-pulse rounded bg-line motion-reduce:animate-none" />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Empty({ hasSaved }: { hasSaved: boolean }) {
  return (
    <div className="mt-12 max-w-prose text-muted">
      <p>
        {hasSaved
          ? "Pick something from your list to see today's prices."
          : "Add something you want to buy. Prices come from Coolblue, bol, MediaMarkt, Alternate, Vanden Borre and Amazon.be, sorted from cheapest to most expensive."}
      </p>
    </div>
  );
}
