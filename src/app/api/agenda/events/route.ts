import type { NextRequest } from "next/server";
import { bad, forbidden, foreign, readJson } from "@/lib/api";
import { addEvent, parseEvent } from "@/lib/agenda";

/** Adds one of your own events: { title, start, end, allDay, location? } with times in Unix ms. */
export async function POST(request: NextRequest) {
  if (foreign(request)) return forbidden();
  const body = await readJson(request);
  if (body instanceof Response) return body;
  const event = parseEvent(body);
  if (typeof event === "string") return bad(event);
  return Response.json({ event: await addEvent(event) }, { status: 201 });
}
