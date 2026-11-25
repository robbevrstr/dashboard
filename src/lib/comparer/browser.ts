// Renders pages that only show their results after JavaScript runs
// (Vanden Borre's search, Amazon when it refuses plain requests).
// Uses the locally installed Chrome through playwright-core, so no browser
// download is needed. Set CHROME_PATH to point at a different Chromium build.
import type { Browser } from "playwright-core";

const g = globalThis as unknown as { __comparerBrowser?: Promise<Browser> };

async function launch() {
  const { chromium } = await import("playwright-core");
  // Playwright turns Chrome's sandbox off by default; keep it on since we load third-party pages.
  // CHROME_SANDBOX=false is for containers that can't create the sandbox's namespaces.
  const chromiumSandbox = process.env.CHROME_SANDBOX !== "false";
  const browser = await chromium.launch(
    process.env.CHROME_PATH
      ? { executablePath: process.env.CHROME_PATH, headless: true, chromiumSandbox }
      : { channel: "chrome", headless: true, chromiumSandbox },
  );
  browser.on("disconnected", () => {
    g.__comparerBrowser = undefined;
  });
  return browser;
}

function getBrowser() {
  // Kept on globalThis so dev hot-reloads reuse one Chrome instead of leaking them.
  g.__comparerBrowser ??= launch().catch((e) => {
    g.__comparerBrowser = undefined;
    throw e;
  });
  return g.__comparerBrowser;
}

type RenderOptions = {
  /** CSS selector that signals the results are on the page. */
  waitFor?: string;
  timeoutMs?: number;
};

// At most this many pages render at once; the rest wait their turn.
const MAX_PAGES = 3;
const MAX_WAITING = 12;
let open = 0;
const queue: (() => void)[] = [];

async function acquire() {
  if (open >= MAX_PAGES) {
    // Fail fast instead of letting a burst of requests pile up behind Chrome.
    if (queue.length >= MAX_WAITING) throw new Error("Browser busy");
    await new Promise<void>((resolve) => queue.push(resolve));
  }
  open++;
}

/** The page may only reach public http(s) hosts — never this machine or the local network. */
function isAllowedRequest(url: string) {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return !(
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) ||
    host === "::1" ||
    /^(fc|fd|fe80)/.test(host)
  );
}

function release() {
  open--;
  queue.shift()?.();
}

export async function renderHtml(url: string, { waitFor, timeoutMs = 20000 }: RenderOptions = {}) {
  await acquire();
  let context: Awaited<ReturnType<Browser["newContext"]>> | undefined;
  try {
    const browser = await getBrowser();
    context = await browser.newContext({
      locale: "nl-BE",
      serviceWorkers: "block",
      acceptDownloads: false,
    });
    const page = await context.newPage();
    // Skip heavy assets (only the markup matters) and anything aimed at private addresses.
    await context.route("**/*", (route) => {
      const req = route.request();
      if (!isAllowedRequest(req.url())) return route.abort("blockedbyclient");
      return ["image", "media", "font", "stylesheet"].includes(req.resourceType())
        ? route.abort()
        : route.continue();
    });
    const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    if (res && res.status() >= 400) throw new Error(`HTTP ${res.status()}`);
    if (waitFor) {
      await page.waitForSelector(waitFor, { timeout: timeoutMs, state: "attached" }).catch(() => {
        // No match within the timeout usually means "no results"; return what's there.
      });
    }
    return await page.content();
  } finally {
    await context?.close().catch(() => {});
    release();
  }
}
