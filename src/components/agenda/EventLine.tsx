// One event on one day: its time, a colour bar for the calendar it's from, title and place.
// No hooks, so the server-rendered dashboard tile and the agenda page can both use it.
import type { AgendaEvent } from "@/lib/agenda/types";
import { clock, dayKey } from "@/lib/day";

/** "09:00–10:30", "All day", "from 22:00" or "until 01:00", as it applies to `day`. */
export function timeText(e: AgendaEvent, day: string) {
  if (e.allDay) return "All day";
  const startsToday = dayKey(e.start) === day;
  const endsToday = dayKey(Math.max(e.start, e.end - 1)) === day;
  if (startsToday && endsToday) return e.end > e.start ? `${clock(e.start)}–${clock(e.end)}` : clock(e.start);
  if (startsToday) return `from ${clock(e.start)}`;
  if (endsToday) return `until ${clock(e.end)}`;
  return "All day";
}

export function EventLine({
  event,
  day,
  color,
  calendarName,
  past = false,
  children,
}: {
  event: AgendaEvent;
  day: string;
  color: string;
  calendarName?: string;
  /** Already over: drawn faded. */
  past?: boolean;
  /** Extra controls at the end of the line, such as a delete button. */
  children?: React.ReactNode;
}) {
  return (
    <div className={`flex min-w-0 items-stretch gap-3 ${past ? "opacity-55" : ""}`}>
      <span className="w-[92px] shrink-0 pt-px text-[13px] leading-5 text-muted tabular-nums">{timeText(event, day)}</span>
      <span aria-hidden className="w-[3px] shrink-0 rounded-full" style={{ background: color }} />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] leading-5 font-medium wrap-break-word">{event.title}</span>
        {event.location || calendarName ? (
          <span className="mt-0.5 block truncate text-[13px] text-muted">
            {[event.location, calendarName].filter(Boolean).join(" · ")}
          </span>
        ) : null}
      </span>
      {children}
    </div>
  );
}
