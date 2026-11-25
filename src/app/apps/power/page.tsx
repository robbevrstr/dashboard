import type { Metadata } from "next";
import { getPowerPrices, POWER_SOURCE } from "@/lib/power";
import { getPowerMix } from "@/lib/powermix";
import { PowerBoard } from "./PowerBoard";

export const metadata: Metadata = {
  title: "Cheapest electricity hours",
  description: "Belgian day-ahead electricity prices, and the cheapest time today or tomorrow to run your appliances.",
};

export default async function PowerPage() {
  const [data, mix] = await Promise.all([getPowerPrices(), getPowerMix()]);
  return (
    <section className="pt-14 pb-16">
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Cheapest electricity hours</h1>
      <p className="mt-4 max-w-xl text-lg leading-relaxed text-muted">
        Belgium&apos;s wholesale electricity price changes every 15 minutes. With a dynamic contract your bill follows
        it, so the same dishwasher run can cost a lot less at the right time.
      </p>

      {data.ok ? (
        <PowerBoard data={data} mix={mix} />
      ) : (
        <p className="mt-10 rounded-lg border border-red-500/30 bg-red-500/5 p-4 text-sm">
          The prices couldn&apos;t be loaded right now. Reload the page in a few minutes.
        </p>
      )}

      <p className="mt-6 max-w-2xl text-sm leading-relaxed text-muted">
        These are day-ahead market prices (EPEX Spot, Belgian zone) without VAT. What you pay on a dynamic contract adds
        your supplier&apos;s margin, network costs and taxes, but those don&apos;t change during the day, so the cheapest
        times are the same. Source:{" "}
        <a href={POWER_SOURCE} className="underline underline-offset-4 hover:text-foreground">
          Energy-Charts
        </a>{" "}
        (Fraunhofer ISE), data from Bundesnetzagentur | SMARD.de, CC BY 4.0.
      </p>
    </section>
  );
}
