import Link from "next/link";

/** One dashboard tile. Its title links to the full app; `note` says where or what the numbers are. */
export function Widget({
  title,
  note,
  href,
  className = "",
  children,
}: {
  title: string;
  note?: string;
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`panel flex min-w-0 flex-col p-6 ${className}`} aria-label={title}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold tracking-tight">
          <Link href={href} className="outline-none hover:underline hover:underline-offset-[3px] focus-visible:underline">
            {title}
          </Link>
        </h2>
        {note ? <p className="min-w-0 truncate text-[13px] text-muted">{note}</p> : null}
      </div>
      <div className="mt-5 flex flex-1 flex-col">{children}</div>
    </section>
  );
}

/** Placeholder while a tile's data loads. */
export function WidgetSkeleton({ title, className = "" }: { title: string; className?: string }) {
  return (
    <section className={`panel flex min-w-0 flex-col p-6 ${className}`} aria-label={title} aria-busy>
      <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
      <div className="mt-5 flex flex-1 flex-col">
        <Pulse />
      </div>
    </section>
  );
}

export function Pulse() {
  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className="h-10 w-40 animate-pulse rounded-lg bg-faint motion-reduce:animate-none" />
      <div className="h-4 w-56 animate-pulse rounded bg-faint motion-reduce:animate-none" />
      <div className="mt-auto h-16 w-full animate-pulse rounded-lg bg-faint motion-reduce:animate-none" />
    </div>
  );
}

export function WidgetError({ children }: { children: React.ReactNode }) {
  return <p className="text-[15px] text-muted">{children}</p>;
}
