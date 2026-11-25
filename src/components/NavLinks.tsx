"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** The header links for larger screens; the current one sits on a soft fill. */
export function NavLinks({ items }: { items: { href: string; label: string }[] }) {
  const path = usePathname();
  // The most specific link wins: on /apps/agenda that's "Agenda", not "Apps".
  const matches = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));
  const active = items.filter((i) => matches(i.href)).sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <ul className="hidden items-center gap-1 text-sm sm:flex">
      {items.map((item) => {
        const current = item.href === active;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={current ? "page" : undefined}
              className="block rounded-lg px-3 py-2 text-muted outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent aria-[current=page]:bg-faint aria-[current=page]:font-medium aria-[current=page]:text-foreground"
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
