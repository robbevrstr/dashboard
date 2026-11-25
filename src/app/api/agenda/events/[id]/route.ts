import type { NextRequest } from "next/server";
import { forbidden, foreign, idOf, notFound } from "@/lib/api";
import { deleteEvent } from "@/lib/agenda";

export async function DELETE(request: NextRequest, ctx: RouteContext<"/api/agenda/events/[id]">) {
  if (foreign(request)) return forbidden();
  const id = await idOf(ctx);
  if (id === undefined || !(await deleteEvent(id))) return notFound();
  return new Response(null, { status: 204 });
}
