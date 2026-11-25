"use client";

// The calendar-shaped views of the agenda: an hour grid for one day or a week (days side by
// side), and a month of day tiles. The list view stays in AgendaView.tsx.
import { useEffect, useRef } from "react";
import { timeText } from "@/components/agenda/EventLine";
import { type AgendaEvent, daysOf } from "@/lib/agenda/types";
import { addDays, clock, dayKey, dayStart } from "@/lib/day";

export type Look = {
  colorOf: (e: AgendaEvent) => string;
  nameOf: (e: AgendaEvent) => string | undefined;
  selected?: string;
  onSelect: (e: AgendaEvent, day: string) => void;
  onOpenDay: (day: string) => void;
};

const HOUR_PX = 48;
const DAY_MS = 86_400_000;
const tint = (color: string, pct: number) => `color-mix(in srgb, ${color} ${pct}%, var(--surface))`;

/** Monday on or before a day. */
export function mondayOf(day: string) {
  const dow = new Date(dayStart(day)).getDay();
  return addDays(day, -((dow + 6) % 7));
}

/** Events per visible day: all-day first, then by start time. */
export function groupByDay(events: AgendaEvent[], days: string[]) {
  const byDay = new Map<string, AgendaEvent[]>(days.map((d) => [d, []]));
  for (const e of events) for (const d of daysOf(e, dayKey, days)) byDay.get(d)!.push(e);
  for (const list of byDay.values()) list.sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start - b.start);
  return byDay;
}

/** A timed event counts as "all day" on a day it covers from midnight to midnight. */
const fillsDay = (e: AgendaEvent, day: string) =>
  e.allDay || (e.start <= dayStart(day) && e.end >= dayStart(addDays(day, 1)));

/* ------------------------------------------------------------------ day and week: an hour grid */

type Placed = { e: AgendaEvent; top: number; height: number; col: number; cols: number };

/** Positions one day's timed events; overlapping ones share the width side by side. */
function place(events: AgendaEvent[], day: string): Placed[] {
  const from = dayStart(day);
  const to = dayStart(addDays(day, 1));
  const items = events
    .map((e) => {
      const s = Math.max(e.start, from);
      const en = Math.max(Math.min(e.end, to), s + 15 * 60_000); // at least 15 minutes tall
      return { e, s, en };
    })
    .sort((a, b) => a.s - b.s || b.en - a.en);

  const out: Placed[] = [];
  let cluster: { item: (typeof items)[number]; col: number }[] = [];
  let colEnds: number[] = [];
  let clusterEnd = -1;
  const flush = () => {
    for (const c of cluster) {
      out.push({
        e: c.item.e,
        top: ((c.item.s - from) / 3_600_000) * HOUR_PX,
        height: Math.max(20, ((c.item.en - c.item.s) / 3_600_000) * HOUR_PX - 2),
        col: c.col,
        cols: colEnds.length,
      });
    }
    cluster = [];
    colEnds = [];
  };
  for (const item of items) {
    if (item.s >= clusterEnd) flush();
    let col = colEnds.findIndex((end) => end <= item.s);
    if (col < 0) col = colEnds.push(item.en) - 1;
    else colEnds[col] = item.en;
    cluster.push({ item, col });
    clusterEnd = Math.max(clusterEnd, item.en);
  }
  flush();
  return out;
}

function DayHead({ day, today, onOpenDay, compact }: { day: string; today: string; onOpenDay: (d: string) => void; compact: boolean }) {
  const date = new Date(dayStart(day));
  const isToday = day === today;
  return (
    <button
      type="button"
      onClick={() => onOpenDay(day)}
      disabled={!compact}
      aria-label={date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
      className="flex flex-col items-center gap-1 rounded-lg py-2 outline-none enabled:hover:bg-faint focus-visible:ring-2 focus-visible:ring-accent"
    >
      <span className={`text-xs ${isToday ? "font-semibold text-accent" : "text-muted"}`}>
        {date.toLocaleDateString("en-GB", { weekday: "short" })}
      </span>
      <span
        className={`grid size-8 place-items-center rounded-full text-[15px] font-semibold tabular-nums ${
          isToday ? "bg-accent text-surface" : ""
        }`}
      >
        {date.getDate()}
      </span>
    </button>
  );
}

export function HourGrid({
  days,
  byDay,
  today,
  now,
  look,
}: {
  days: string[];
  byDay: Map<string, AgendaEvent[]>;
  today: string;
  now: number;
  look: Look;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const week = days.length > 1;
  const cols = `3.25rem repeat(${days.length}, minmax(0, 1fr))`;

  // Open at 07:00, or an hour before the first event if that's earlier.
  const firstHour = Math.min(
    7,
    ...days.flatMap((d) =>
      byDay
        .get(d)!
        .filter((e) => !fillsDay(e, d))
        .map((e) => new Date(Math.max(e.start, dayStart(d))).getHours() - 1),
    ),
  );
  const key = days.join();
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = Math.max(0, firstHour) * HOUR_PX;
    // only when the shown days change, not on every refresh
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const allDay = days.map((d) => byDay.get(d)!.filter((e) => fillsDay(e, d)));
  const hasAllDay = allDay.some((l) => l.length);
  const nowTop = ((now - dayStart(dayKey(now))) / 3_600_000) * HOUR_PX;

  return (
    <div className={week ? "-mx-5 overflow-x-auto px-5 sm:-mx-6 sm:px-6" : ""}>
      <div className={week ? "min-w-[720px]" : ""}>
        {week ? (
          <div className="grid border-b border-line" style={{ gridTemplateColumns: cols }}>
            <span />
            {days.map((d) => (
              <DayHead key={d} day={d} today={today} onOpenDay={look.onOpenDay} compact />
            ))}
          </div>
        ) : null}

        {hasAllDay ? (
          <div className="grid border-b border-line py-1.5" style={{ gridTemplateColumns: cols }}>
            <span className="self-center pr-2 text-right text-[11px] text-muted">All day</span>
            {allDay.map((list, i) => (
              <div key={days[i]} className="flex min-w-0 flex-col gap-1 px-0.5">
                {list.map((e) => (
                  <EventChip key={e.id} e={e} day={days[i]} look={look} filled />
                ))}
              </div>
            ))}
          </div>
        ) : null}

        <div ref={scroller} className="max-h-[38rem] overflow-y-auto overscroll-contain">
          <div className="relative grid" style={{ gridTemplateColumns: cols, height: 24 * HOUR_PX }}>
            {/* Hour labels and lines */}
            <div className="relative">
              {Array.from({ length: 23 }, (_, h) => (
                <span key={h} className="absolute right-2 -translate-y-1/2 text-[11px] text-muted tabular-nums" style={{ top: (h + 1) * HOUR_PX }}>
                  {String(h + 1).padStart(2, "0")}:00
                </span>
              ))}
            </div>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 right-0 left-[3.25rem]"
              style={{ backgroundImage: "linear-gradient(to bottom, var(--line) 1px, transparent 1px)", backgroundSize: `100% ${HOUR_PX}px` }}
            />
            {days.map((d) => {
              const placed = place(byDay.get(d)!.filter((e) => !fillsDay(e, d)), d);
              return (
                <div key={d} className={`relative min-w-0 border-l border-line ${d === today && week ? "bg-accent/[0.04]" : ""}`}>
                  {placed.map((p) => (
                    <TimedBlock key={p.e.id} p={p} day={d} look={look} />
                  ))}
                  {d === today ? (
                    <div aria-hidden className="pointer-events-none absolute right-0 left-0 z-10 flex items-center" style={{ top: nowTop }}>
                      <span className="-ml-1 size-2 rounded-full bg-poor-dot" />
                      <span className="h-px flex-1 bg-poor-dot" />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function TimedBlock({ p, day, look }: { p: Placed; day: string; look: Look }) {
  const color = look.colorOf(p.e);
  const selected = look.selected === p.e.id;
  const short = p.height < 40;
  return (
    <button
      type="button"
      onClick={() => look.onSelect(p.e, day)}
      aria-pressed={selected}
      title={`${timeText(p.e, day)} ${p.e.title}`}
      className="absolute overflow-hidden rounded-md border-l-[3px] px-1.5 py-0.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent"
      style={{
        top: p.top + 1,
        height: p.height,
        left: `calc(${(p.col / p.cols) * 100}% + 2px)`,
        width: `calc(${100 / p.cols}% - 4px)`,
        borderLeftColor: color,
        background: tint(color, selected ? 34 : 18),
      }}
    >
      <span className={`block truncate text-[13px] leading-4 font-medium ${short ? "inline" : ""}`}>{p.e.title}</span>
      {short ? null : <span className="block truncate text-[11px] leading-4 text-muted">{timeText(p.e, day)}</span>}
    </button>
  );
}

function EventChip({ e, day, look, filled }: { e: AgendaEvent; day: string; look: Look; filled?: boolean }) {
  const color = look.colorOf(e);
  const selected = look.selected === e.id;
  return (
    <button
      type="button"
      onClick={() => look.onSelect(e, day)}
      aria-pressed={selected}
      title={`${timeText(e, day)} ${e.title}`}
      className="flex w-full min-w-0 items-center gap-1.5 rounded-[5px] px-1.5 py-0.5 text-left text-xs leading-4 outline-none focus-visible:ring-2 focus-visible:ring-accent"
      style={{ background: filled || selected ? tint(color, selected ? 34 : 20) : undefined }}
    >
      {filled ? null : <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: color }} />}
      {filled || e.allDay ? null : <span className="shrink-0 text-muted tabular-nums">{clock(Math.max(e.start, dayStart(day)))}</span>}
      <span className="min-w-0 truncate font-medium">{e.title}</span>
    </button>
  );
}

/* ------------------------------------------------------------------ month: a tile per day */

const MAX_CHIPS = 3;

export function MonthGrid({
  days,
  month,
  byDay,
  today,
  look,
}: {
  days: string[];
  /** "YYYY-MM" of the month being shown; other days are drawn faded. */
  month: string;
  byDay: Map<string, AgendaEvent[]>;
  today: string;
  look: Look;
}) {
  const weekdays = days.slice(0, 7).map((d) => new Date(dayStart(d)).toLocaleDateString("en-GB", { weekday: "short" }));
  // Leave off a sixth row that's entirely next month.
  const shown = days.slice(35).every((d) => !d.startsWith(month)) ? days.slice(0, 35) : days;
  return (
    <div>
      <div className="grid grid-cols-7 pb-2 text-center text-xs text-muted">
        {weekdays.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <ol className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-line bg-line">
        {shown.map((d) => {
          const list = byDay.get(d)!;
          const inMonth = d.startsWith(month);
          const isToday = d === today;
          const date = new Date(dayStart(d));
          const extra = list.length - MAX_CHIPS;
          return (
            <li key={d} className={`flex min-h-16 min-w-0 flex-col gap-0.5 p-1 sm:min-h-28 sm:p-1.5 ${inMonth ? "bg-surface" : "bg-faint/60"}`}>
              <button
                type="button"
                onClick={() => look.onOpenDay(d)}
                aria-label={`${date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}${
                  list.length ? `, ${list.length} event${list.length === 1 ? "" : "s"}` : ""
                }`}
                className={`grid size-7 place-items-center self-start rounded-full text-[13px] tabular-nums outline-none hover:bg-faint focus-visible:ring-2 focus-visible:ring-accent ${
                  isToday ? "bg-accent font-semibold text-surface hover:bg-accent" : inMonth ? "font-medium" : "text-muted"
                }`}
              >
                {date.getDate()}
              </button>
              {/* Phones: a dot per event. Wider screens: the events themselves. */}
              <span aria-hidden className="flex flex-wrap gap-0.5 px-1 sm:hidden">
                {list.slice(0, 4).map((e) => (
                  <span key={e.id} className="size-1.5 rounded-full" style={{ background: look.colorOf(e) }} />
                ))}
              </span>
              <div className="hidden min-w-0 flex-col gap-0.5 sm:flex">
                {list.slice(0, extra > 0 ? MAX_CHIPS - 1 : MAX_CHIPS).map((e) => (
                  <EventChip key={e.id} e={e} day={d} look={look} filled={fillsDay(e, d)} />
                ))}
                {extra > 0 ? (
                  <button
                    type="button"
                    onClick={() => look.onOpenDay(d)}
                    className="rounded-[5px] px-1.5 text-left text-xs text-muted outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    {extra + 1} more
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* ------------------------------------------------------------------ the chosen event */

export function EventDetails({
  event,
  day,
  look,
  onRemove,
  onClose,
}: {
  event: AgendaEvent;
  day: string;
  look: Look;
  onRemove: (e: AgendaEvent) => void;
  onClose: () => void;
}) {
  const color = look.colorOf(event);
  const date = new Date(dayStart(day)).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const days = event.allDay
    ? Math.round((dayStart(event.endDay!) - dayStart(event.startDay!)) / DAY_MS)
    : 1;
  return (
    <div className="mt-4 flex items-start gap-3 rounded-xl border border-line p-3.5" style={{ background: tint(color, 8) }}>
      <span aria-hidden className="mt-1 h-9 w-[3px] shrink-0 rounded-full" style={{ background: color }} />
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold wrap-break-word">{event.title}</p>
        <p className="mt-0.5 text-[13px] text-muted">
          {date}, {timeText(event, day).toLowerCase()}
          {days > 1 ? ` (${days} days)` : ""}
          {event.location ? `. ${event.location}` : ""}
          {look.nameOf(event) ? `. From ${look.nameOf(event)}` : ""}
        </p>
      </div>
      {event.calendar === null ? (
        <button
          type="button"
          onClick={() => onRemove(event)}
          className="h-8 shrink-0 rounded-[10px] border border-poor/40 px-2.5 text-sm font-medium text-poor outline-none hover:bg-poor/10 focus-visible:ring-2 focus-visible:ring-accent"
        >
          Delete
        </button>
      ) : null}
      <button
        type="button"
        onClick={onClose}
        className="grid size-8 shrink-0 place-items-center rounded-md text-muted outline-none hover:bg-faint hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent"
      >
        <span className="sr-only">Close</span>
        <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
      </button>
    </div>
  );
}
