// Downloads a calendar feed from a link you paste: Google ("secret address in iCal format"),
// Outlook ("publish calendar", ICS link), iCloud (public calendar, webcal://) or any .ics URL.
// Only public internet addresses are fetched, never this machine or your local network.
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export class FeedError extends Error {}

const MAX_BYTES = 10 * 1024 * 1024;
const TIMEOUT_MS = 20_000;
const MAX_REDIRECTS = 5;

/** webcal:// and bare addresses become https://; anything other than http(s) is refused. */
export function normaliseUrl(raw: string): URL {
  let text = raw.trim();
  if (!text || text.length > 2000) throw new FeedError("Paste the calendar's link, at most 2000 characters.");
  text = text.replace(/^webcals?:\/\//i, "https://");
  if (!/^[a-z][a-z\d+.-]*:/i.test(text)) text = `https://${text}`;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new FeedError("That isn't a link. Paste the calendar's full address.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new FeedError("Only http, https and webcal links can be imported.");
  if (url.username || url.password) throw new FeedError("Links with a user name or password in them aren't supported.");
  return url;
}

function privateAddress(ip: string): boolean {
  const mapped = ip.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return privateAddress(mapped[1]);
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }
  const v6 = ip.toLowerCase();
  return v6 === "::" || v6 === "::1" || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6) || /^ff/.test(v6);
}

/**
 * Refuses hosts that resolve to this machine or the local network. fetch() looks the name up
 * again, so a hostile DNS server could still swap the answer in between; that leaves a small
 * gap, acceptable for a dashboard only you can reach.
 */
async function assertPublic(url: URL) {
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const local = /(^|\.)(localhost|local|internal|home\.arpa)$/.test(host);
  let addresses: string[] = [];
  if (!local) {
    try {
      addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
    } catch {
      throw new FeedError(`Couldn't find ${host}. Check the link.`);
    }
  }
  if (local || addresses.some(privateAddress)) {
    throw new FeedError("That link points to this computer or your local network, which can't be imported.");
  }
}

async function readLimited(res: Response) {
  const length = Number(res.headers.get("content-length"));
  if (length > MAX_BYTES) throw new FeedError("That calendar is larger than 10 MB.");
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel().catch(() => {});
      throw new FeedError("That calendar is larger than 10 MB.");
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

function statusMessage(status: number) {
  if (status === 401 || status === 403) return "The calendar refused access. Use its secret or public iCal address.";
  if (status === 404 || status === 410) return "There's no calendar at that link (any more).";
  return `The calendar's server answered with an error (${status}). Try again later.`;
}

/** The feed's text. Throws FeedError with a sentence you can show. */
export async function fetchFeed(raw: string): Promise<string> {
  let url = normaliseUrl(raw);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublic(url);
    let res: Response;
    try {
      res = await fetch(url, {
        redirect: "manual",
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { Accept: "text/calendar, text/plain;q=0.9, */*;q=0.5", "User-Agent": "dashboard-calendar/1.0" },
      });
    } catch (e) {
      if (e instanceof Error && e.name === "TimeoutError") throw new FeedError("The calendar took too long to answer.");
      throw new FeedError(`Couldn't reach ${url.hostname}.`);
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      // Each hop is checked again, so a redirect can't lead to a private address.
      url = normaliseUrl(new URL(res.headers.get("location")!, url).href);
      await res.body?.cancel().catch(() => {});
      continue;
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      throw new FeedError(statusMessage(res.status));
    }
    const text = await readLimited(res);
    if (!/^﻿?\s*BEGIN:VCALENDAR/i.test(text)) {
      throw new FeedError("That link didn't return a calendar. Use the iCal (.ics) address, not the web page's address.");
    }
    return text;
  }
  throw new FeedError("That link redirects too many times.");
}
