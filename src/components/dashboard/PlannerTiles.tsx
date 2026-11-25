// The agenda and task tiles. Both read the database on the server at request time; the task
// tile hands its list to a small client part so tasks can be ticked off or added in place.
import Link from "next/link";
import { after, connection } from "next/server";
import { EventLine } from "@/components/agenda/EventLine";
import { getAgenda, refreshStale } from "@/lib/agenda";
import { type AgendaEvent, daysOf } from "@/lib/agenda/types";
import { addDays, clock, dayKey, dayLabel } from "@/lib/day";
import { listTasks } from "@/lib/tasks";
import { Refresher } from "./Refresher";
import { TasksTileBody } from "./TasksTileBody";
import { Widget } from "./Widget";

const OWN_COLOR = "var(--accent)";
const MAX_SHOWN = 6;

/** The time of this request. Waiting for the request first keeps it out of the prerender. */
async function requestTime() {
  await connection();
  return Date.now();
}

export async function AgendaTile() {
  const now = await requestTime();
  const today = dayKey(now);
  const days = [today, addDays(today, 1)];
  const { events, calendars } = await getAgenda(today, 2);
  after(refreshStale);

  // What's still to come today and tomorrow, all-day events first on each day.
  const rows: { day: string; event: AgendaEvent }[] = [];
  for (const day of days) {
    const list = events
      .filter((e) => daysOf(e, dayKey, [day]).length && (day !== today || e.allDay || e.end > now || (e.end === e.start && e.start >= now)))
      .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start - b.start);
    rows.push(...list.map((event) => ({ day, event })));
  }
  // What is going on right now, and the first thing after it. Both get their own block at the
  // top, so they leave the lists below.
  const current = rows.filter(({ event: e }) => !e.allDay && e.start <= now && e.end > now).map((r) => r.event);
  const next = rows.find(({ event: e }) => !e.allDay && e.start > now)?.event;
  const rest = rows.filter(({ event: e }) => !current.includes(e) && e !== next);
  const shown = rest.slice(0, MAX_SHOWN - current.length - (next ? 1 : 0));
  const failing = calendars.filter((c) => c.error).length;
  const color = (e: AgendaEvent) => calendars.find((c) => c.id === e.calendar)?.color ?? OWN_COLOR;

  return (
    <Widget
      title="Agenda"
      note={failing ? `${failing} calendar${failing > 1 ? "s" : ""} not updating` : "Today and tomorrow"}
      href="/apps/agenda"
      className="flex-[7_1_520px]"
    >
      <Refresher />
      {current.length || next ? <NowBlock current={current} next={next} now={now} today={today} color={color} /> : null}
      {shown.length ? (
        <ol className={`space-y-4 ${current.length || next ? "mt-5" : "-mt-1"}`}>
          {days.map((day) => {
            const list = shown.filter((r) => r.day === day);
            if (!list.length) return null;
            return (
              <li key={day}>
                <h3 className={`text-[13px] font-semibold ${day === today ? "text-accent" : "text-muted"}`}>{day === today && (current.length || next) ? "Later today" : dayLabel(day, today)}</h3>
                <ul className="mt-2.5 space-y-3">
                  {list.map(({ event }) => (
                    <li key={event.id}>
                      <EventLine event={event} day={day} color={color(event)} />
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ol>
      ) : current.length || next ? null : (
        <p className="max-w-130 text-[15px] leading-relaxed text-muted">
          Nothing on your agenda for the rest of today or tomorrow.{" "}
          {calendars.length ? null : "Add events, or import your calendar from Google, Outlook or iCloud with a link."}
        </p>
      )}
      <p className="mt-auto pt-5 text-[13px] text-muted">
        {rest.length > shown.length ? `${rest.length - shown.length} more. ` : ""}
        <Link href="/apps/agenda" className="underline underline-offset-[3px] hover:text-foreground">
          {calendars.length ? "Open the agenda" : "Add an event or import a calendar"}
        </Link>
      </p>
    </Widget>
  );
}

/** "Now" with what is on (or "Free now"), and what comes next. */
function NowBlock({
  current,
  next,
  now,
  today,
  color,
}: {
  current: AgendaEvent[];
  next?: AgendaEvent;
  now: number;
  today: string;
  color: (e: AgendaEvent) => string;
}) {
  const nextDay = next ? dayKey(next.start) : today;
  const nextWhen = next ? `${nextDay === today ? "" : `${dayLabel(nextDay, today)} `}at ${clock(next.start)}` : "";
  const mins = next ? Math.round((next.start - now) / 60000) : 0;
  const soon = next && mins <= 90 ? ` · in ${mins < 60 ? `${Math.max(1, mins)} min` : `${Math.floor(mins / 60)} h ${mins % 60} min`}` : "";
  return (
    <div className="-mt-1 space-y-3 rounded-xl bg-faint px-4 py-3.5">
      {current.length ? (
        current.map((e) => (
          <div key={e.id} className="flex min-w-0 items-stretch gap-3">
            <span className="flex w-[92px] shrink-0 items-start gap-2 pt-px text-[13px] leading-5 font-semibold text-accent">
              <span aria-hidden className="mt-[7px] size-1.5 rounded-full bg-accent motion-safe:animate-pulse" />
              Now
            </span>
            <span aria-hidden className="w-[3px] shrink-0 rounded-full" style={{ background: color(e) }} />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] leading-5 font-semibold wrap-break-word">{e.title}</span>
              <span className="mt-0.5 block truncate text-[13px] text-muted">
                {[`until ${dayKey(e.end - 1) === today ? clock(e.end) : `${dayLabel(dayKey(e.end - 1), today)} ${clock(e.end)}`}`, e.location].filter(Boolean).join(" · ")}
              </span>
            </span>
          </div>
        ))
      ) : (
        <p className="flex items-center gap-2 text-[13px] leading-5 font-semibold text-good">
          <span aria-hidden className="size-1.5 rounded-full bg-good-dot" />
          Free now{next && nextDay === today ? ` until ${clock(next.start)}` : ""}
        </p>
      )}
      {next ? (
        <div className="flex min-w-0 items-stretch gap-3">
          <span className="w-[92px] shrink-0 pt-px text-[13px] leading-5 text-muted">Next</span>
          <span aria-hidden className="w-[3px] shrink-0 rounded-full" style={{ background: color(next) }} />
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] leading-5 font-medium wrap-break-word">{next.title}</span>
            <span className="mt-0.5 block truncate text-[13px] text-muted">
              {[nextWhen + soon, next.location].filter(Boolean).join(" · ")}
            </span>
          </span>
        </div>
      ) : null}
    </div>
  );
}

export async function TasksTile() {
  const today = dayKey(await requestTime());
  const tasks = await listTasks();
  return (
    <Widget title="Tasks and deadlines" href="/apps/tasks" className="flex-[5_1_360px]">
      <TasksTileBody initial={tasks} today={today} />
    </Widget>
  );
}
