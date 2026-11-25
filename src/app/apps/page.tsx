import type { Metadata } from "next";
import { AppCard, cardSpan } from "@/components/AppCard";
import { games, tools } from "@/lib/apps";

export const metadata: Metadata = {
  title: "Apps",
  description: "Every tool and game on this dashboard.",
};

export default function AppsPage() {
  return (
    <section className="pt-14 pb-20">
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Apps</h1>
      <p className="mt-4 max-w-xl text-lg leading-relaxed text-muted">
        Small tools for everyday questions, from prices to the weather, and a few quick games.
      </p>
      <h2 className="mt-12 text-2xl font-semibold tracking-tight">Tools</h2>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        {tools.map((app, i) => (
          <AppCard key={app.slug} app={app} className={cardSpan(i, tools.length)} />
        ))}
      </div>
      <h2 id="games" className="mt-14 scroll-mt-20 text-2xl font-semibold tracking-tight">
        Games
      </h2>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        {games.map((app, i) => (
          <AppCard key={app.slug} app={app} className={cardSpan(i, games.length)} />
        ))}
      </div>
    </section>
  );
}
