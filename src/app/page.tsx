import Link from "next/link";
import { Suspense } from "react";
import { FuelTile, GamesTile, PowerTile, WatchlistTile } from "@/components/dashboard/ServerWidgets";
import { AgendaTile, TasksTile } from "@/components/dashboard/PlannerTiles";
import { GoingOutTile, Hero, SkyTile, TodayProvider } from "@/components/dashboard/Today";
import { WidgetSkeleton } from "@/components/dashboard/Widget";
import { apps } from "@/lib/apps";

export default function Home() {
  return (
    <TodayProvider>
      <Hero />

      {/* Rows of tiles that share the width 7:5, 7:5, 7:5 and 8:4, and stack on a phone. */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-4">
          <Suspense fallback={<WidgetSkeleton title="Agenda" className="flex-[7_1_520px]" />}>
            <AgendaTile />
          </Suspense>
          <Suspense fallback={<WidgetSkeleton title="Tasks" className="flex-[5_1_360px]" />}>
            <TasksTile />
          </Suspense>
        </div>
        <div className="flex flex-wrap gap-4">
          <GoingOutTile />
          <SkyTile />
        </div>
        <div className="flex flex-wrap gap-4">
          <Suspense fallback={<WidgetSkeleton title="Electricity in Belgium" className="flex-[7_1_520px]" />}>
            <PowerTile />
          </Suspense>
          <Suspense fallback={<WidgetSkeleton title="Fuel in Belgium" className="flex-[5_1_360px]" />}>
            <FuelTile />
          </Suspense>
        </div>
        <div className="flex flex-wrap gap-4">
          <Suspense fallback={<WidgetSkeleton title="Watchlist" className="flex-[8_1_520px]" />}>
            <WatchlistTile />
          </Suspense>
          <Suspense fallback={<WidgetSkeleton title="Games" className="flex-[4_1_300px]" />}>
            <GamesTile />
          </Suspense>
        </div>
      </div>

      <section aria-labelledby="all-apps" className="pt-14 pb-12">
        <h2 id="all-apps" className="text-[15px] font-semibold tracking-tight">
          All apps
        </h2>
        <ul className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-2">
          {apps.map((app) => (
            <li key={app.slug}>
              <Link
                href={`/apps/${app.slug}`}
                className="panel flex flex-col gap-0.5 rounded-xl px-4 py-3.5 outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <span className="text-[15px] font-medium">{app.title}</span>
                <span className="text-[13px] text-muted">{app.short}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </TodayProvider>
  );
}
