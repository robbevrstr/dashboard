// The agenda, server side: events you add yourself plus calendars imported from a link.
// Imported feeds are stored as downloaded and refreshed in the background when they are
// more than half an hour old; parsed feeds are kept in memory until the next download.
import { db } from "../db";
import { dayStart } from "../day";
import { FeedError, fetchFeed, normaliseUrl } from "./fetch";
import { type Feed, parseFeed } from "./ics";
import { type Agenda, type AgendaEvent, CALENDAR_COLORS, type CalendarInfo, MAX_EVENT_TITLE } from "./types";

export { FeedError };

const STALE_MS = 30 * 60_000;
export const MAX_CALENDARS = 20;

type CalendarRow = {
  id: number;
  name: string;
  url: string;
  color: string;
  ics: string;
  fetched_at: number;
  checked_at: number;
  error: string | null;
};
type EventRow = { id: number; title: string; start: number; end: number; all_day: number; location: string | null };

type FeedCache = Map<number, { fetchedAt: number; feed: Feed | null }>;
// Kept on globalThis so dev hot-reloads don't parse every feed again.
const g = globalThis as unknown as { __agendaFeeds?: FeedCache; __agendaRefreshing?: Map<number, Promise<void>> };
const feeds: FeedCache = (g.__agendaFeeds ??= new Map());
const refreshing: Map<number, Promise<void>> = (g.__agendaRefreshing ??= new Map());

const info = (r: Omit<CalendarRow, "ics">): CalendarInfo => ({
  id: r.id,
  name: r.name,
  host: new URL(r.url).hostname,
  color: r.color,
  fetchedAt: r.fetched_at,
  error: r.error,
});

export async function listCalendars(): Promise<CalendarInfo[]> {
  const rows = (await db())
    .prepare("SELECT id, name, url, color, fetched_at, checked_at, error FROM calendars ORDER BY id")
    .all() as Omit<CalendarRow, "ics">[];
  return rows.map(info);
}

function feedOf(row: Pick<CalendarRow, "id" | "ics" | "fetched_at">): Feed | null {
  const cached = feeds.get(row.id);
  if (cached && cached.fetchedAt === row.fetched_at) return cached.feed;
  let feed: Feed | null = null;
  try {
    feed = parseFeed(row.ics);
  } catch {
    // stored text that no longer parses shows no events until the next good download
  }
  feeds.set(row.id, { fetchedAt: row.fetched_at, feed });
  return feed;
}

/** Parses a fresh download and walks its repeating events up to a month ahead, so pages don't wait for that. */
function warm(id: number, fetchedAt: number, feed: Feed) {
  feeds.set(id, { fetchedAt, feed });
  const now = Date.now();
  feed.between(now - 86_400_000, now + 31 * 86_400_000);
}

export const cleanName = (v: unknown, max = 80) => {
  if (typeof v !== "string") return undefined;
  const t = v.replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : undefined;
};

/** Downloads and checks a feed, then saves it. Throws FeedError with a reason you can show. */
export async function addCalendar(rawUrl: string, name?: string): Promise<CalendarInfo> {
  const conn = await db();
  const existing = conn.prepare("SELECT url, color FROM calendars").all() as { url: string; color: string }[];
  if (existing.length >= MAX_CALENDARS) throw new FeedError(`You can import up to ${MAX_CALENDARS} calendars.`);
  const url = normaliseUrl(rawUrl).href;
  if (existing.some((c) => c.url === url)) throw new FeedError("That calendar is already imported.");

  const ics = await fetchFeed(url);
  let feed: Feed;
  try {
    feed = parseFeed(ics);
  } catch {
    throw new FeedError("That link returned a calendar the dashboard couldn't read.");
  }
  const used = new Set(existing.map((c) => c.color));
  const color = CALENDAR_COLORS.find((c) => !used.has(c)) ?? CALENDAR_COLORS[existing.length % CALENDAR_COLORS.length];
  const now = Date.now();
  const row = conn
    .prepare(
      `INSERT INTO calendars (name, url, color, ics, fetched_at, checked_at, error, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?) RETURNING id, name, url, color, fetched_at, checked_at, error`,
    )
    .get(name || feed.name || new URL(url).hostname, url, color, ics, now, now, now) as Omit<CalendarRow, "ics">;
  warm(row.id, now, feed);
  return info(row);
}

/** Downloads a calendar again. A failure keeps the last good copy and records why. */
export function refreshCalendar(id: number): Promise<void> {
  const running = refreshing.get(id);
  if (running) return running;
  const job = (async () => {
    const conn = await db();
    const row = conn.prepare("SELECT url FROM calendars WHERE id = ?").get(id) as { url: string } | undefined;
    if (!row) return;
    const now = Date.now();
    try {
      const ics = await fetchFeed(row.url);
      let feed: Feed;
      try {
        feed = parseFeed(ics);
      } catch {
        throw new FeedError("The calendar's link now returns something the dashboard can't read.");
      }
      conn.prepare("UPDATE calendars SET ics = ?, fetched_at = ?, checked_at = ?, error = NULL WHERE id = ?").run(ics, now, now, id);
      warm(id, now, feed);
    } catch (e) {
      const reason = e instanceof FeedError ? e.message : "The calendar couldn't be read.";
      conn.prepare("UPDATE calendars SET checked_at = ?, error = ? WHERE id = ?").run(now, reason, id);
    }
  })().finally(() => refreshing.delete(id));
  refreshing.set(id, job);
  return job;
}

/** Refreshes every calendar not checked in the last half hour. Meant to run after a response. */
export async function refreshStale() {
  const rows = (await db()).prepare("SELECT id FROM calendars WHERE checked_at < ?").all(Date.now() - STALE_MS) as { id: number }[];
  await Promise.all(rows.map((r) => refreshCalendar(r.id)));
}

export async function updateCalendar(id: number, change: { name?: string; color?: string }) {
  const conn = await db();
  if (change.name !== undefined) conn.prepare("UPDATE calendars SET name = ? WHERE id = ?").run(change.name, id);
  if (change.color !== undefined) conn.prepare("UPDATE calendars SET color = ? WHERE id = ?").run(change.color, id);
  const row = conn
    .prepare("SELECT id, name, url, color, fetched_at, checked_at, error FROM calendars WHERE id = ?")
    .get(id) as Omit<CalendarRow, "ics"> | undefined;
  return row && info(row);
}

export async function deleteCalendar(id: number) {
  feeds.delete(id);
  return (await db()).prepare("DELETE FROM calendars WHERE id = ?").run(id).changes > 0;
}

/* ------------------------------------------------------------------ your own events */

export type NewEvent = { title: string; start: number; end: number; allDay: boolean; location?: string };

/** Checks a new event's JSON; a string means it was refused, with the reason. */
export function parseEvent(body: Record<string, unknown>): NewEvent | string {
  const title = cleanName(body.title, MAX_EVENT_TITLE);
  if (!title) return "An event needs a title.";
  const allDay = body.allDay === true;
  const { start, end } = body;
  if (typeof start !== "number" || typeof end !== "number" || !Number.isFinite(start) || !Number.isFinite(end)) {
    return "An event needs a start and an end.";
  }
  if (end < start) return "The end is before the start.";
  if (end - start > 366 * 86_400_000) return "An event can last a year at most.";
  const location = cleanName(body.location, 200);
  return { title, start, end, allDay, location };
}

export async function addEvent(e: NewEvent): Promise<AgendaEvent> {
  const r = (await db())
    .prepare("INSERT INTO events (title, start, end, all_day, location, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING *")
    .get(e.title, e.start, e.end, e.allDay ? 1 : 0, e.location ?? null, Date.now()) as EventRow;
  return ownEvent(r);
}

export async function deleteEvent(id: number) {
  return (await db()).prepare("DELETE FROM events WHERE id = ?").run(id).changes > 0;
}

const pad = (n: number) => String(n).padStart(2, "0");
const localDay = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

function ownEvent(r: EventRow): AgendaEvent {
  return {
    id: `e${r.id}`,
    title: r.title,
    start: r.start,
    end: r.end,
    allDay: !!r.all_day,
    startDay: r.all_day ? localDay(r.start) : undefined,
    endDay: r.all_day ? localDay(r.end) : undefined,
    location: r.location ?? undefined,
    calendar: null,
  };
}

/* ------------------------------------------------------------------ reading the agenda */

/** Everything between local midnight on `fromDay` and `days` days later, sorted by start. */
export async function getAgenda(fromDay: string, days: number): Promise<Agenda> {
  const from = dayStart(fromDay);
  const [y, m, d] = fromDay.split("-").map(Number);
  const to = new Date(y, m - 1, d + days).getTime();
  const conn = await db();

  const own = (conn.prepare("SELECT * FROM events WHERE start < ? AND end >= ?").all(to, from) as EventRow[])
    .map(ownEvent)
    .filter((e) => Math.max(e.end, e.start + 1) > from);

  const rows = conn.prepare("SELECT id, name, url, color, ics, fetched_at, checked_at, error FROM calendars ORDER BY id").all() as CalendarRow[];
  const imported = rows.flatMap((row) =>
    (feedOf(row)?.between(from, to) ?? []).map(({ key, ...o }) => ({ ...o, id: `c${row.id}:${key}`, calendar: row.id })),
  );

  const events = [...own, ...imported].sort((a, b) => a.start - b.start || Number(b.allDay) - Number(a.allDay) || a.end - b.end);
  return { events, calendars: rows.map(info) };
}
