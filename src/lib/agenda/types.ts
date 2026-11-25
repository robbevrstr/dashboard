// Shapes the agenda API sends to the browser. Safe to import from client components.

export type AgendaEvent = {
  /** "e12" for an event you added, "c3:<uid>|<repeat>" for one from imported calendar 3. */
  id: string;
  title: string;
  start: number;
  end: number;
  allDay: boolean;
  /** All-day only: the first day and the day after the last (local YYYY-MM-DD). */
  startDay?: string;
  endDay?: string;
  location?: string;
  /** The imported calendar it comes from, or null for your own. */
  calendar: number | null;
};

export type CalendarInfo = {
  id: number;
  name: string;
  /** Only the host is shown: the full link is often a secret address. */
  host: string;
  color: string;
  /** Last successful download (Unix ms). */
  fetchedAt: number;
  /** Why the last refresh failed, or null. */
  error: string | null;
};

export type Agenda = { events: AgendaEvent[]; calendars: CalendarInfo[] };

/** Mid-tone colours that read on both the light and the dark theme. Your own events use the accent. */
export const CALENDAR_COLORS = ["#0e9fb8", "#2fb872", "#efa43a", "#e5675a", "#9b6cf0", "#e0569b", "#7fa82a"];

export const MAX_DAYS = 92;
export const MAX_EVENT_TITLE = 200;

/** The days an event covers, as local YYYY-MM-DD strings, limited to the visible ones. */
export function daysOf(e: AgendaEvent, dayKey: (t: number) => string, visible: string[]) {
  const first = e.allDay ? e.startDay! : dayKey(e.start);
  // A timed event ending at midnight doesn't spill into the next day.
  const last = e.allDay ? undefined : dayKey(Math.max(e.start, e.end - 1));
  return visible.filter((d) => (e.allDay ? d >= first && d < e.endDay! : d >= first && d <= last!));
}
