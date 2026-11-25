import Link from "next/link";
import type { MiniApp } from "@/lib/apps";

/** An app as an instrument panel: its name and what it does. Unfinished apps aren't links. */
export function AppCard({ app, className = "" }: { app: MiniApp; className?: string }) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-4">
        <h3 className="text-lg font-semibold tracking-tight">{app.title}</h3>
        {app.status !== "live" ? (
          <span className="mt-1 shrink-0 font-mono text-xs text-muted">{app.status === "building" ? "Building" : "Planned"}</span>
        ) : null}
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted">{app.description}</p>
    </>
  );

  if (app.status === "live") {
    return (
      <Link href={`/apps/${app.slug}`} className={`panel flex flex-col p-5 outline-none ${className}`}>
        {body}
      </Link>
    );
  }
  return <div className={`panel flex flex-col p-5 opacity-70 ${className}`}>{body}</div>;
}

/** Three cards per row on wide screens; a short last row stretches to fill the width. */
export function cardSpan(i: number, n: number) {
  const rest = n % 3;
  if (rest && i >= n - rest) return rest === 1 ? "lg:col-span-6" : "lg:col-span-3";
  return "lg:col-span-2";
}
