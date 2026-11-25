import type { NextRequest } from "next/server";
import { bad, forbidden, foreign, readJson } from "@/lib/api";
import { addCalendar, cleanName, FeedError } from "@/lib/agenda";

/** Imports a calendar from a link: { url, name? }. Downloads it once to check it's a calendar. */
export async function POST(request: NextRequest) {
  if (foreign(request)) return forbidden();
  const body = await readJson(request);
  if (body instanceof Response) return body;
  if (typeof body.url !== "string") return bad("Paste the calendar's link.");
  try {
    const calendar = await addCalendar(body.url, cleanName(body.name));
    return Response.json({ calendar }, { status: 201 });
  } catch (e) {
    if (e instanceof FeedError) return bad(e.message);
    return Response.json({ error: "The calendar couldn't be imported. Try again." }, { status: 500 });
  }
}
