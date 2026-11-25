// Reads an iCalendar (.ics) feed and lists the events in a time window, with repeating
// events expanded, moved or cancelled occurrences applied, and time zones converted.
// Parsing is done by ical.js; this file decides what counts as an event and how times map.
import ICAL from "ical.js";

type Time = InstanceType<typeof ICAL.Time>;
type Event = InstanceType<typeof ICAL.Event>;
type Component = InstanceType<typeof ICAL.Component>;

export type Occurrence = {
  /** Stable per occurrence: the event's UID plus which repeat it is. */
  key: string;
  title: string;
  start: number;
  end: number;
  allDay: boolean;
  /** All-day only: the first day and the day after the last (local). */
  startDay?: string;
  endDay?: string;
  location?: string;
};

export type Feed = {
  name?: string;
  between(from: number, to: number): Occurrence[];
};

/** A repeating event is walked from its first date; this many steps covers a daily event for 100+ years. */
const MAX_STEPS = 50_000;

const pad = (n: number) => String(n).padStart(2, "0");
const dayOf = (t: Time) => `${t.year}-${pad(t.month)}-${pad(t.day)}`;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Throws when the text isn't a calendar ical.js can read. */
export function parseFeed(text: string): Feed {
  const jcal = ICAL.parse(text);
  // One calendar parses to its jCal array; several to an array of them. Only the first is used.
  const root = new ICAL.Component(Array.isArray(jcal[0]) ? jcal[0] : jcal);
  const name = root.getFirstPropertyValue("x-wr-calname");

  // Moved or cancelled single occurrences carry a RECURRENCE-ID and the series' UID.
  const exceptions = new Map<string, Component[]>();
  const series: Component[] = [];
  for (const c of root.getAllSubcomponents("vevent")) {
    if (c.hasProperty("recurrence-id")) {
      const uid = String(c.getFirstPropertyValue("uid") ?? "");
      exceptions.set(uid, [...(exceptions.get(uid) ?? []), c]);
    } else {
      series.push(c);
    }
  }

  const events: Event[] = [];
  const seen = new Set<string>();
  for (const c of series) {
    const uid = String(c.getFirstPropertyValue("uid") ?? "");
    try {
      // Pass the exceptions explicitly: left out, ical.js relates every RECURRENCE-ID in the
      // whole file to this event, whatever its UID.
      events.push(new ICAL.Event(c, { exceptions: exceptions.get(uid) ?? [] }));
      seen.add(uid);
    } catch {
      // one broken event shouldn't hide the rest
    }
  }
  // An exception whose series isn't in the feed is shown as an event of its own.
  for (const [uid, list] of exceptions) {
    if (seen.has(uid)) continue;
    for (const c of list) {
      try {
        events.push(new ICAL.Event(c, { exceptions: [] }));
      } catch {}
    }
  }

  // Walking a repeating event is slow in ical.js (a daily event since 2016 is 4000 steps), so
  // each one keeps its walk: the repeats from a year ago on, and where it stopped. Later
  // requests continue from there; only a request further back than a year walks from scratch.
  const floor = dayNumber(addDaysMs(Date.now(), -400));
  const walks = new Map<Event, Walk>();

  return {
    name: typeof name === "string" && name.trim() ? clip(name.trim(), 80) : undefined,
    between(from, to) {
      const out: Occurrence[] = [];
      for (const ev of events) {
        try {
          collect(ev, from, to, out, floor, walks);
        } catch {
          // skip events with dates ical.js can't work with
        }
      }
      return out;
    },
  };
}

type Walk = { it: ReturnType<Event["iterator"]>; kept: { day: number; time: Time }[]; reached: number; steps: number; done: boolean };

const dayOfTime = (t: Time) => t.year * 10_000 + t.month * 100 + t.day;

/** The repeats whose start date falls between two day numbers. */
function repeats(ev: Event, first: number, last: number, floor: number, walks: Map<Event, Walk>): Time[] {
  if (first < floor) {
    const it = ev.iterator();
    const found: Time[] = [];
    let next: Time | null;
    for (let i = 0; i < MAX_STEPS && (next = it.next()); i++) {
      const day = dayOfTime(next);
      if (day > last) break;
      if (day >= first) found.push(next);
    }
    return found;
  }
  let walk = walks.get(ev);
  if (!walk) walks.set(ev, (walk = { it: ev.iterator(), kept: [], reached: 0, steps: 0, done: false }));
  while (!walk.done && walk.reached <= last && walk.steps < MAX_STEPS) {
    const next = walk.it.next();
    walk.steps++;
    if (!next) {
      walk.done = true;
      break;
    }
    walk.reached = dayOfTime(next);
    if (walk.reached >= floor) walk.kept.push({ day: walk.reached, time: next });
  }
  return walk.kept.filter((k) => k.day >= first && k.day <= last).map((k) => k.time);
}

function collect(ev: Event, from: number, to: number, out: Occurrence[], floor: number, walks: Map<Event, Walk>) {
  if (cancelled(ev.component)) return;
  const tzid = tzidOf(ev.component);
  if (!ev.isRecurring()) {
    push(out, ev, ev.startDate, ev.endDate, ev.uid, tzid, from, to);
    return;
  }
  // Repeats are picked by calendar date first, which is cheap; only those near the window get
  // the full treatment (exceptions, time zones). The margin covers time zone offsets and how
  // long the event lasts, so one that started earlier but is still going is kept.
  const length = Math.max(0, ev.endDate.toUnixTime() - ev.startDate.toUnixTime());
  const margin = 2 + Math.ceil(length / 86_400);
  for (const next of repeats(ev, dayNumber(addDaysMs(from, -margin)), dayNumber(addDaysMs(to, 2)), floor, walks)) {
    if (toMs(next, tzid) >= to) break;
    const d = ev.getOccurrenceDetails(next);
    if (cancelled(d.item.component)) continue;
    push(out, d.item, d.startDate, d.endDate, `${ev.uid}|${next.toICALString()}`, tzid, from, to);
  }
}

function push(out: Occurrence[], ev: Event, start: Time, end: Time, key: string, tzid: string | undefined, from: number, to: number) {
  const allDay = start.isDate;
  const s = toMs(start, tzid);
  let e = toMs(end, tzid);
  let endDay = allDay ? dayOf(end) : undefined;
  if (!(e > s)) {
    // No or a broken end: an all-day event lasts its one day, a timed one is a moment.
    if (allDay) {
      const next = start.clone();
      next.day += 1;
      e = toMs(next, tzid);
      endDay = dayOf(next);
    } else {
      e = s;
    }
  }
  if (!(s < to && Math.max(e, s + 1) > from)) return;
  out.push({
    key,
    title: clip(ev.summary?.trim() || "Busy", 300),
    start: s,
    end: e,
    allDay,
    startDay: allDay ? dayOf(start) : undefined,
    endDay,
    location: ev.location?.trim() ? clip(ev.location.trim(), 200) : undefined,
  });
}

const addDaysMs = (t: number, n: number) => t + n * 86_400_000;
/** 20261125 for 25 November 2026 (in UTC; the margins above absorb the difference). */
const dayNumber = (t: number) => {
  const d = new Date(t);
  return d.getUTCFullYear() * 10_000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
};

const cancelled = (c: Component) => String(c.getFirstPropertyValue("status") ?? "").toUpperCase() === "CANCELLED";

function tzidOf(c: Component) {
  const tzid = c.getFirstProperty("dtstart")?.getParameter("tzid");
  return typeof tzid === "string" ? tzid : undefined;
}

/**
 * Unix ms for a calendar time. Dates are local midnights. Times in a zone the feed defines
 * (VTIMEZONE) or in UTC are converted by ical.js; a TZID the feed names but doesn't define
 * would otherwise be read as server time, so a known IANA name is converted here.
 */
function toMs(t: Time, tzid?: string) {
  if (t.isDate) return new Date(t.year, t.month - 1, t.day).getTime();
  if (t.zone?.tzid === "floating" && tzid && validZone(tzid)) return zonedToUtc(t, tzid);
  return t.toJSDate().getTime();
}

const zoneFormat = new Map<string, Intl.DateTimeFormat | null>();

function formatFor(tz: string) {
  if (!zoneFormat.has(tz)) {
    try {
      zoneFormat.set(
        tz,
        new Intl.DateTimeFormat("en-US", {
          timeZone: tz,
          hourCycle: "h23",
          year: "numeric",
          month: "numeric",
          day: "numeric",
          hour: "numeric",
          minute: "numeric",
          second: "numeric",
        }),
      );
    } catch {
      zoneFormat.set(tz, null);
    }
  }
  return zoneFormat.get(tz)!;
}

const validZone = (tz: string) => formatFor(tz) !== null;

/** How far the zone's wall clock is ahead of UTC at that moment, in ms. */
function offsetAt(utc: number, tz: string) {
  const parts = Object.fromEntries(formatFor(tz)!.formatToParts(new Date(utc)).map((p) => [p.type, Number(p.value)]));
  const wall = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour % 24, parts.minute, parts.second);
  return wall - Math.floor(utc / 1000) * 1000;
}

function zonedToUtc(t: Time, tz: string) {
  const wall = Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second);
  const first = wall - offsetAt(wall, tz);
  // A second pass settles times near a daylight-saving change.
  return wall - offsetAt(first, tz);
}
