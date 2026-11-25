import type { NextRequest } from "next/server";
import { bad, forbidden, foreign, idOf, notFound, readJson } from "@/lib/api";
import { cleanName, deleteCalendar, refreshCalendar, updateCalendar } from "@/lib/agenda";
import { CALENDAR_COLORS } from "@/lib/agenda/types";

/** Renames or recolours a calendar ({ name?, color? }), or downloads it again ({ refresh: true }). */
export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/agenda/calendars/[id]">) {
  if (foreign(request)) return forbidden();
  const id = await idOf(ctx);
  if (id === undefined) return notFound();
  const body = await readJson(request);
  if (body instanceof Response) return body;

  const change: { name?: string; color?: string } = {};
  if ("name" in body) {
    const name = cleanName(body.name);
    if (!name) return bad("A calendar needs a name.");
    change.name = name;
  }
  if ("color" in body) {
    if (!CALENDAR_COLORS.includes(body.color as string)) return bad("Pick one of the listed colours.");
    change.color = body.color as string;
  }
  if (body.refresh === true) await refreshCalendar(id);
  const calendar = await updateCalendar(id, change);
  return calendar ? Response.json({ calendar }) : notFound();
}

export async function DELETE(request: NextRequest, ctx: RouteContext<"/api/agenda/calendars/[id]">) {
  if (foreign(request)) return forbidden();
  const id = await idOf(ctx);
  if (id === undefined || !(await deleteCalendar(id))) return notFound();
  return new Response(null, { status: 204 });
}
