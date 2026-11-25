import type { NextRequest } from "next/server";
import { foreign } from "@/lib/api";
import { deleteSetting, getSetting, isSettingKey, setSetting } from "@/lib/settings";

/** Settings are small: a list of saved items is the biggest. */
const MAX_BYTES = 256 * 1024;

async function keyOf(ctx: RouteContext<"/api/settings/[key]">) {
  const { key } = await ctx.params;
  return isSettingKey(key) ? key : undefined;
}

export async function GET(request: NextRequest, ctx: RouteContext<"/api/settings/[key]">) {
  const key = await keyOf(ctx);
  if (!key) return Response.json({ error: "Unknown setting" }, { status: 404 });
  if (foreign(request)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const value = await getSetting(key);
  return Response.json({ value: value ?? null }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: NextRequest, ctx: RouteContext<"/api/settings/[key]">) {
  const key = await keyOf(ctx);
  if (!key) return Response.json({ error: "Unknown setting" }, { status: 404 });
  if (foreign(request)) return Response.json({ error: "Forbidden" }, { status: 403 });
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return Response.json({ error: "Send JSON" }, { status: 415 });
  }
  const text = await request.text();
  if (text.length > MAX_BYTES) return Response.json({ error: "Too large" }, { status: 413 });
  let body: { value?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (body.value === undefined || body.value === null) await deleteSetting(key);
  else await setSetting(key, body.value);
  return new Response(null, { status: 204 });
}

export async function DELETE(request: NextRequest, ctx: RouteContext<"/api/settings/[key]">) {
  const key = await keyOf(ctx);
  if (!key) return Response.json({ error: "Unknown setting" }, { status: 404 });
  if (foreign(request)) return Response.json({ error: "Forbidden" }, { status: 403 });
  await deleteSetting(key);
  return new Response(null, { status: 204 });
}
