// Shared checks for the API routes that read or change your data.
import type { NextRequest } from "next/server";

/**
 * Only this dashboard's own pages may use these routes. Another site open in the same browser
 * could otherwise send a request to localhost. Browsers mark cross-site requests with
 * Sec-Fetch-Site, and requiring JSON forces a CORS preflight that these routes never answer.
 */
export function foreign(request: NextRequest) {
  const site = request.headers.get("sec-fetch-site");
  return site !== null && site !== "same-origin" && site !== "none";
}

export const forbidden = () => Response.json({ error: "Forbidden" }, { status: 403 });

/** The JSON body as an object, or a Response explaining why it was refused. */
export async function readJson(request: NextRequest, maxBytes = 16 * 1024): Promise<Record<string, unknown> | Response> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return Response.json({ error: "Send JSON" }, { status: 415 });
  }
  const text = await request.text();
  if (text.length > maxBytes) return Response.json({ error: "Too large" }, { status: 413 });
  try {
    const body = JSON.parse(text);
    if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {}
  return Response.json({ error: "Invalid JSON" }, { status: 400 });
}

/** A route's numeric [id], or undefined when it isn't one. */
export async function idOf(ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return /^\d{1,12}$/.test(id) ? Number(id) : undefined;
}

export const notFound = () => Response.json({ error: "Not found" }, { status: 404 });
export const bad = (error: string) => Response.json({ error }, { status: 400 });
export const NO_STORE = { "Cache-Control": "no-store" };
