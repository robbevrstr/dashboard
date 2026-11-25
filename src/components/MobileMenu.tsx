"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Item = { href: string; label: string; external?: boolean };

/** Menu button for small screens; the header shows the links inline from `sm` up. */
export function MobileMenu({ items }: { items: Item[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);

  // Close after navigating, and on Escape or a tap outside.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative sm:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="mobile-menu"
        onClick={() => setOpen((o) => !o)}
        className="grid size-8 place-items-center rounded-md text-muted outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent"
      >
        <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
        <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
          {open ? <path d="M5 5l10 10M15 5L5 15" /> : <path d="M3 6h14M3 10h14M3 14h14" />}
        </svg>
      </button>
      {open ? (
        <ul
          id="mobile-menu"
          className="absolute right-0 top-10 z-20 w-48 rounded-xl border border-line bg-surface p-1.5 text-sm shadow-lg"
        >
          {items.map((item) => (
            <li key={item.href}>
              {item.external ? (
                <a href={item.href} className="block rounded-lg px-3 py-2 hover:bg-faint">
                  {item.label}
                </a>
              ) : (
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={pathname === item.href ? "page" : undefined}
                  className="block rounded-lg px-3 py-2 hover:bg-faint aria-[current=page]:bg-faint aria-[current=page]:font-medium"
                >
                  {item.label}
                </Link>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
