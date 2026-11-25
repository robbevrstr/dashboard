import Link from "next/link";
import { site } from "@/lib/site";
import { MobileMenu } from "./MobileMenu";
import { NavLinks } from "./NavLinks";
import { ThemeToggle } from "./ThemeToggle";

const nav = [
  { href: "/", label: "Today" },
  { href: "/apps/agenda", label: "Agenda" },
  { href: "/apps/tasks", label: "Tasks" },
  { href: "/apps", label: "Apps" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-background/85 backdrop-blur-md">
      <nav className="mx-auto flex max-w-[75rem] items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight outline-none focus-visible:underline"
        >
          <Logo />
          {site.name}
        </Link>
        <div className="flex items-center gap-1">
          <NavLinks items={nav} />
          <ThemeToggle />
          <MobileMenu items={nav} />
        </div>
      </nav>
    </header>
  );
}

/** A rounded square with a dot: a screen with one thing on it. */
function Logo() {
  return (
    <span aria-hidden className="relative inline-block size-[22px] rounded-[7px] bg-foreground">
      <span className="absolute top-1.5 left-1.5 size-2.5 rounded-full bg-background" />
    </span>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line">
      <div className="mx-auto flex max-w-[75rem] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-6 text-[13px] text-muted sm:px-6">
        <p>
          © {site.year} {site.author}. Open source under the{" "}
          <a
            href={`${site.repo}/blob/main/LICENSE`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-[3px] hover:text-foreground"
          >
            MIT license
          </a>
          .
        </p>
        <a
          href={site.repo}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 outline-none hover:text-foreground focus-visible:text-foreground focus-visible:underline"
        >
          Source on GitHub
          <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M7 17 17 7M8 7h9v9" />
          </svg>
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      </div>
    </footer>
  );
}
