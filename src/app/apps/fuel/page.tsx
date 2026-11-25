import type { Metadata } from "next";
import { FUEL_SOURCE, FUELS, getFuelData } from "@/lib/fuel";
import { FuelBoard } from "./FuelBoard";

export const metadata: Metadata = {
  title: "Fuel prices",
  description: "Today's official maximum fuel prices in Belgium, with a year of history.",
};

export default async function FuelPage() {
  const data = await getFuelData();
  const fuels = FUELS.map(({ id, label, detail, color }) => ({ id, label, detail, color }));

  return (
    <section className="pt-14">
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Fuel prices</h1>
      <p className="mt-4 max-w-xl text-lg leading-relaxed text-muted">
        The official maximum prices in Belgium, set by the federal government. Stations can charge less, but never
        more.
      </p>

      {data.ok ? (
        <FuelBoard data={data} fuels={fuels} />
      ) : (
        <p className="mt-10 rounded-lg border border-red-500/30 bg-red-500/5 p-4 text-sm">
          The price data from Statbel couldn&apos;t be loaded right now. Reload the page in a few minutes.
        </p>
      )}

      <p className="pb-16 text-sm text-muted">
        Source:{" "}
        <a href={FUEL_SOURCE} className="underline underline-offset-4 hover:text-foreground">
          FOD Economie via Statbel
        </a>
        , updated daily. New prices are usually announced the day before they apply.
      </p>
    </section>
  );
}
