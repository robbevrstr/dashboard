import { after, type NextRequest } from "next/server";
import { bad, forbidden, foreign, NO_STORE } from "@/lib/api";
import { getAgenda, refreshStale } from "@/lib/agenda";
import { MAX_DAYS } from "@/lib/agenda/types";
import { isDay } from "@/lib/day";

/** Events from ?from=YYYY-MM-DD for ?days=N days, plus the imported calendars. */
export async function GET(request: NextRequest) {
  if (foreign(request)) return forbidden();
  const params = request.nextUrl.searchParams;
  const from = params.get("from");
  const days = Number(params.get("days") ?? 14);
  if (!isDay(from)) return bad("from must be a date (YYYY-MM-DD).");
  if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) return bad(`days must be between 1 and ${MAX_DAYS}.`);
  const agenda = await getAgenda(from, days);
  // Old feeds are downloaded again once this answer is on its way; the next load shows the result.
  after(refreshStale);
  return Response.json(agenda, { headers: NO_STORE });
}
