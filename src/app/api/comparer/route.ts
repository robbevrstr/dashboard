import type { NextRequest } from "next/server";
import { BusyError, searchAll } from "@/lib/comparer/search";

// Each search fans out to six shops (and sometimes Chrome), so limit how often
// one visitor can trigger it. In-memory: fine for a single server instance.
// searchAll() also has a server-wide cap, so even a fooled limit can't overload the shops.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 15;
const hits = new Map<string, number[]>();

function rateLimited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.delete(hits.keys().next().value!);
  return recent.length > MAX_PER_WINDOW;
}

/**
 * The visitor's address as seen by our own proxy. Cloudflare and nginx/Caddy set these headers
 * themselves; in X-Forwarded-For only the last entry was added by our proxy, anything before it
 * could have been typed in by the visitor.
 */
function clientIp(request: NextRequest) {
  const h = request.headers;
  return (
    h.get("cf-connecting-ip")?.trim() ||
    h.get("x-real-ip")?.trim() ||
    h.get("x-forwarded-for")?.split(",").at(-1)?.trim() ||
    "local"
  );
}

export async function GET(request: NextRequest) {
  const ip = clientIp(request);
  if (rateLimited(ip)) {
    return Response.json(
      { error: "Too many searches in a short time. Wait a minute and try again." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (query.length < 2 || query.length > 80) {
    return Response.json(
      { error: "Search for something between 2 and 80 characters." },
      { status: 400 },
    );
  }
  try {
    return Response.json(await searchAll(query));
  } catch (e) {
    if (e instanceof BusyError) {
      return Response.json(
        { error: "The comparer is busy right now. Try again in a minute." },
        { status: 503, headers: { "Retry-After": "60" } },
      );
    }
    return Response.json({ error: "The search failed. Try again." }, { status: 500 });
  }
}
