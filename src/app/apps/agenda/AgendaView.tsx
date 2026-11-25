"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { EventLine } from "@/components/agenda/EventLine";
import { type Agenda, type AgendaEvent, type CalendarInfo } from "@/lib/agenda/types";
import { addDays, dayKey, dayLabel, dayStart } from "@/lib/day";
import { request } from "@/lib/request";
import { loadSetting, saveSetting } from "@/lib/store";
import { EventDetails, groupByDay, HourGrid, type Look, mondayOf, MonthGrid } from "./CalendarViews";

const OWN_COLOR = "var(--accent)";

const VIEWS = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "list", label: "List" },
] as const;
type View = (typeof VIEWS)[number]["id"];
const isView = (v: unknown): v is View => VIEWS.some((x) => x.id === v);

/** The days a view shows around the chosen day. */
function rangeOf(view: View, anchor: string) {
  if (view === "day") return { from: anchor, days: 1 };
  if (view === "week") return { from: mondayOf(anchor), days: 7 };
  if (view === "month") return { from: mondayOf(`${anchor.slice(0, 7)}-01`), days: 42 };
  return { from: anchor, days: 14 };
}

/** One step back or forward in a view. */
function step(view: View, anchor: string, dir: 1 | -1) {
  if (view === "day") return addDays(anchor, dir);
  if (view === "month") {
    const [y, m] = anchor.split("-").map(Number);
    return dayKey(new Date(y, m - 1 + dir, 1));
  }
  return addDays(anchor, 7 * dir);
}

const short = (day: string, opts: Intl.DateTimeFormatOptions) => new Date(dayStart(day)).toLocaleDateString("en-GB", opts);

function titleOf(view: View, anchor: string, today: string) {
  const { from, days } = rangeOf(view, anchor);
  const last = addDays(from, days - 1);
  if (view === "day") {
    const label = dayLabel(anchor, today);
    const full = short(anchor, { weekday: "long", day: "numeric", month: "long" });
    return label === full ? label : `${label}, ${full}`;
  }
  if (view === "month") return short(anchor, { month: "long", year: "numeric" });
  return `${short(from, { day: "numeric", month: "short" })} – ${short(last, { day: "numeric", month: "short", year: "numeric" })}`;
}

const input =
  "h-10 w-full min-w-0 rounded-[10px] border border-line bg-background px-3 text-[15px] outline-none placeholder:text-muted focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30";
const primary =
  "h-10 rounded-[10px] bg-foreground px-4 text-[15px] font-medium text-surface outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:opacity-40";
const quiet =
  "h-9 rounded-[10px] border border-line px-3 text-sm font-medium outline-none hover:border-muted focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40";

export function AgendaView() {
  const [today, setToday] = useState<string>();
  const [anchor, setAnchor] = useState<string>();
  const [view, setView] = useState<View>("week");
  const [data, setData] = useState<Agenda>();
  const [error, setError] = useState<string>();
  const [now, setNow] = useState(0);
  const [selected, setSelected] = useState<{ id: string; day: string }>();

  useEffect(() => {
    const t = dayKey(Date.now());
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the date is only known in the browser
    setToday(t);
    setAnchor(t);
    setNow(Date.now());
    let live = true;
    loadSetting("agenda-view", isView).then((v) => {
      if (live && v) setView(v);
    });
    // Keep the red "now" line moving.
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, []);

  const range = anchor ? rangeOf(view, anchor) : undefined;
  const from = range?.from;
  const span = range?.days;

  const load = useCallback(async () => {
    if (!from || !span) return;
    const r = await request<Agenda>("GET", `/api/agenda?from=${from}&days=${span}`);
    if (r.ok) {
      setData(r.data);
      setError(undefined);
      setNow(Date.now());
    } else setError(r.error);
  }, [from, span]);

  const pickView = (v: View) => {
    setView(v);
    setSelected(undefined);
    saveSetting("agenda-view", v);
  };
  const move = (day: string) => {
    setAnchor(day);
    setSelected(undefined);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads from the server, then sets state
    load();
  }, [load]);

  const calendars = data?.calendars ?? [];
  const colorOf = (e: AgendaEvent) => calendars.find((c) => c.id === e.calendar)?.color ?? OWN_COLOR;
  const nameOf = (e: AgendaEvent) => calendars.find((c) => c.id === e.calendar)?.name;

  const removeEvent = async (e: AgendaEvent) => {
    setSelected(undefined);
    setData((d) => d && { ...d, events: d.events.filter((x) => x.id !== e.id) });
    const r = await request("DELETE", `/api/agenda/events/${e.id.slice(1)}`);
    if (!r.ok) {
      setError(r.error);
      load();
    }
  };

  const visible = useMemo(() => (from && span ? Array.from({ length: span }, (_, i) => addDays(from, i)) : []), [from, span]);
  const byDay = useMemo(() => groupByDay(data?.events ?? [], visible), [data, visible]);
  const chosen = selected && data?.events.find((e) => e.id === selected.id);

  const look: Look = {
    colorOf,
    nameOf,
    selected: selected?.id,
    onSelect: (e, day) => setSelected((s) => (s?.id === e.id ? undefined : { id: e.id, day })),
    onOpenDay: (day) => {
      setAnchor(day);
      setSelected(undefined);
      setView("day");
      saveSetting("agenda-view", "day");
    },
  };

  // The list leaves room for the forms beside it; the calendar views use the full width.
  const wide = view !== "list";

  return (
    <div className={`mt-10 grid gap-6 pb-20 ${wide ? "" : "lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start"}`}>
      <section aria-label="Agenda" className="panel min-w-0 p-5 sm:p-6">
        <Toolbar view={view} anchor={anchor} today={today} onView={pickView} onMove={move} />
        {error ? <p className="mt-4 rounded-lg bg-poor/10 px-3 py-2 text-sm text-poor">{error}</p> : null}
        {!data || !anchor || !today ? (
          <div className="mt-6 space-y-3" aria-busy>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-faint motion-reduce:animate-none" />
            ))}
          </div>
        ) : (
          <>
            {chosen && selected ? (
              <EventDetails event={chosen} day={selected.day} look={look} onRemove={removeEvent} onClose={() => setSelected(undefined)} />
            ) : null}
            <div className="mt-4">
              {view === "list" ? (
                <Days byDay={byDay} visible={visible} today={today} now={now} colorOf={colorOf} nameOf={nameOf} onRemove={removeEvent} />
              ) : view === "month" ? (
                <MonthGrid days={visible} month={anchor.slice(0, 7)} byDay={byDay} today={today} look={look} />
              ) : (
                <HourGrid days={visible} byDay={byDay} today={today} now={now} look={look} />
              )}
            </div>
          </>
        )}
      </section>

      <div className={`grid min-w-0 gap-6 ${wide ? "lg:grid-cols-2 lg:items-start" : ""}`}>
        <NewEvent today={view === "list" ? today : anchor} onAdded={load} />
        <Calendars calendars={calendars} loaded={!!data} onChanged={load} />
      </div>
    </div>
  );
}

const UNIT: Record<View, string> = { day: "day", week: "week", month: "month", list: "week" };

function Toolbar({
  view,
  anchor,
  today,
  onView,
  onMove,
}: {
  view: View;
  anchor?: string;
  today?: string;
  onView: (v: View) => void;
  onMove: (day: string) => void;
}) {
  // "Today" is pointless when today is already in view.
  const range = anchor ? rangeOf(view, anchor) : undefined;
  const showsToday =
    !!range && !!today && (view === "month" ? anchor!.slice(0, 7) === today.slice(0, 7) : today >= range.from && today < addDays(range.from, range.days));
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-semibold tracking-tight" aria-live="polite">
        {anchor && today ? titleOf(view, anchor, today) : " "}
      </h2>
      <div className="flex flex-wrap items-center gap-1.5">
        <div role="group" aria-label="View" className="flex rounded-[10px] bg-faint p-0.5">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              aria-pressed={view === v.id}
              onClick={() => onView(v.id)}
              className="h-8 rounded-lg px-3 text-sm font-medium text-muted outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent aria-pressed:bg-surface aria-pressed:text-foreground aria-pressed:shadow-sm"
            >
              {v.label}
            </button>
          ))}
        </div>
        <button type="button" disabled={!anchor || showsToday} onClick={() => today && onMove(today)} className={quiet}>
          Today
        </button>
        <button type="button" disabled={!anchor} onClick={() => anchor && onMove(step(view, anchor, -1))} className={`${quiet} w-9 px-0`}>
          <span aria-hidden>‹</span>
          <span className="sr-only">Previous {UNIT[view]}</span>
        </button>
        <button type="button" disabled={!anchor} onClick={() => anchor && onMove(step(view, anchor, 1))} className={`${quiet} w-9 px-0`}>
          <span aria-hidden>›</span>
          <span className="sr-only">Next {UNIT[view]}</span>
        </button>
      </div>
    </div>
  );
}

function Days({
  byDay,
  visible,
  today,
  now,
  colorOf,
  nameOf,
  onRemove,
}: {
  byDay: Map<string, AgendaEvent[]>;
  visible: string[];
  today: string;
  now: number;
  colorOf: (e: AgendaEvent) => string;
  nameOf: (e: AgendaEvent) => string | undefined;
  onRemove: (e: AgendaEvent) => void;
}) {
  const shown = visible.filter((d) => byDay.get(d)!.length || d === today);

  if (!shown.length) {
    return <p className="mt-10 mb-6 text-center text-[15px] text-muted">Nothing on your agenda for these two weeks.</p>;
  }
  return (
    <ol>
      {shown.map((day) => {
        const list = byDay.get(day)!;
        return (
          <li key={day} className="border-t border-line py-4 first:border-t-0">
            <h2 className={`text-[13px] font-semibold ${day === today ? "text-accent" : "text-muted"}`}>
              {dayLabel(day, today)}
              {day === today || day === addDays(today, 1) || day === addDays(today, -1) ? (
                <span className="font-normal">
                  {" · "}
                  {new Date(dayStart(day)).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
                </span>
              ) : null}
            </h2>
            {list.length ? (
              <ul className="mt-3 space-y-3.5">
                {list.map((e) => (
                  <li key={`${e.id}@${day}`} className="group">
                    <EventLine event={e} day={day} color={colorOf(e)} calendarName={nameOf(e)} past={e.end <= now && !(e.allDay && day >= today)}>
                      {e.calendar === null ? (
                        <button
                          type="button"
                          onClick={() => onRemove(e)}
                          className="grid size-7 shrink-0 place-items-center self-start rounded-md text-muted outline-none hover:bg-faint hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                        >
                          <span className="sr-only">Delete “{e.title}”</span>
                          <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                            <path d="M4 4l8 8M12 4l-8 8" />
                          </svg>
                        </button>
                      ) : null}
                    </EventLine>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[15px] text-muted">Nothing planned.</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------------ adding an event */

const pad = (n: number) => String(n).padStart(2, "0");

function NewEvent({ today, onAdded }: { today?: string; onAdded: () => void }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [lastDay, setLastDay] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  // Defaults once the browser's clock is known: today, from the next full hour for an hour.
  useEffect(() => {
    if (!today) return;
    const h = Math.min(new Date().getHours() + 1, 23);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the time is only known in the browser
    setDate(today);
    setStartTime(`${pad(h)}:00`);
    setEndTime(`${pad(Math.min(h + 1, 23))}:${h + 1 > 23 ? "59" : "00"}`);
  }, [today]);

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!title.trim() || !date || busy) return;
    let start: number, end: number;
    if (allDay) {
      const last = lastDay && lastDay >= date ? lastDay : date;
      start = dayStart(date);
      end = dayStart(addDays(last, 1));
    } else {
      if (!startTime) return setError("Give the event a start time.");
      start = new Date(`${date}T${startTime}`).getTime();
      end = endTime ? new Date(`${date}T${endTime}`).getTime() : start;
      // 22:00 to 01:00 runs past midnight.
      if (end < start) end += 86_400_000;
    }
    setBusy(true);
    const r = await request("POST", "/api/agenda/events", { title, start, end, allDay, location: location || undefined });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setError(undefined);
    setTitle("");
    setLocation("");
    onAdded();
  };

  return (
    <section aria-labelledby="new-event" className="panel p-5 sm:p-6">
      <h2 id="new-event" className="text-[15px] font-semibold tracking-tight">
        Add an event
      </h2>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
        <Field label="What">
          <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} placeholder="Dentist, dinner with Sam…" className={input} />
        </Field>
        <div className="flex gap-3">
          <Field label={allDay ? "First day" : "Date"}>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className={input} />
          </Field>
          {allDay ? (
            <Field label="Last day">
              <input type="date" value={lastDay && lastDay >= date ? lastDay : date} min={date} onChange={(e) => setLastDay(e.target.value)} className={input} />
            </Field>
          ) : null}
        </div>
        {!allDay ? (
          <div className="flex gap-3">
            <Field label="From">
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required className={input} />
            </Field>
            <Field label="Until">
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={input} />
            </Field>
          </div>
        ) : null}
        <label className="flex w-fit cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="size-4 accent-accent" />
          All day
        </label>
        <Field label="Where (optional)">
          <input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={200} className={input} />
        </Field>
        {error ? <p className="text-sm text-poor">{error}</p> : null}
        <button type="submit" disabled={!title.trim() || busy} className={`${primary} mt-1`}>
          {busy ? "Adding…" : "Add event"}
        </button>
      </form>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1.5">
      <span className="text-[13px] text-muted">{label}</span>
      {children}
    </label>
  );
}

/* ------------------------------------------------------------------ imported calendars */

function ago(t: number) {
  const min = Math.round((Date.now() - t) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

function Calendars({ calendars, loaded, onChanged }: { calendars: CalendarInfo[]; loaded: boolean; onChanged: () => void }) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [working, setWorking] = useState<number>();
  const [confirming, setConfirming] = useState<number>();

  const importIt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || busy) return;
    setBusy(true);
    const r = await request("POST", "/api/agenda/calendars", { url, name: name || undefined });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setError(undefined);
    setUrl("");
    setName("");
    onChanged();
  };

  const act = async (id: number, method: "PATCH" | "DELETE") => {
    setWorking(id);
    const r = await request(method, `/api/agenda/calendars/${id}`, method === "PATCH" ? { refresh: true } : undefined);
    setWorking(undefined);
    setConfirming(undefined);
    if (!r.ok) setError(r.error);
    onChanged();
  };

  return (
    <section aria-labelledby="calendars" className="panel p-5 sm:p-6">
      <h2 id="calendars" className="text-[15px] font-semibold tracking-tight">
        Calendars
      </h2>
      <ul className="mt-3">
        <li className="flex items-center gap-2.5 py-2 text-[15px]">
          <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: OWN_COLOR }} />
          Your events
        </li>
        {calendars.map((c) => (
          <li key={c.id} className="flex items-start gap-2.5 border-t border-line py-2.5">
            <span aria-hidden className="mt-1.75 size-2.5 shrink-0 rounded-full" style={{ background: c.color }} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px]">{c.name}</p>
              <p className={`text-[13px] ${c.error ? "text-poor" : "text-muted"}`}>
                {c.error ? c.error : `${c.host}, updated ${ago(c.fetchedAt)}`}
              </p>
            </div>
            {confirming === c.id ? (
              <span className="flex shrink-0 gap-1">
                <button type="button" onClick={() => act(c.id, "DELETE")} disabled={working === c.id} className={`${quiet} h-8 border-poor/40 px-2.5 text-poor`}>
                  Remove
                </button>
                <button type="button" onClick={() => setConfirming(undefined)} className={`${quiet} h-8 px-2.5`}>
                  Keep
                </button>
              </span>
            ) : (
              <span className="flex shrink-0 gap-1">
                <button type="button" onClick={() => act(c.id, "PATCH")} disabled={working === c.id} className={`${quiet} h-8 w-8 px-0`}>
                  <svg viewBox="0 0 16 16" aria-hidden className={`mx-auto size-3.5 ${working === c.id ? "animate-spin motion-reduce:animate-none" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                    <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3" />
                  </svg>
                  <span className="sr-only">Refresh {c.name}</span>
                </button>
                <button type="button" onClick={() => setConfirming(c.id)} className={`${quiet} h-8 w-8 px-0`}>
                  <svg viewBox="0 0 16 16" aria-hidden className="mx-auto size-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <path d="M4 4l8 8M12 4l-8 8" />
                  </svg>
                  <span className="sr-only">Remove {c.name}</span>
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>

      <form onSubmit={importIt} className="mt-3 flex flex-col gap-3 border-t border-line pt-4">
        <h3 className="text-[13px] font-semibold text-muted">Import a calendar from a link</h3>
        <Field label="Calendar link (iCal, .ics or webcal://)">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="https://… or webcal://…"
            className={input}
          />
        </Field>
        <Field label="Name (optional)">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Work, school, football…" className={input} />
        </Field>
        {error ? <p className="text-sm text-poor">{error}</p> : null}
        <button type="submit" disabled={!url.trim() || busy || !loaded} className={primary}>
          {busy ? "Importing…" : "Import"}
        </button>
        <details className="group text-[13px] leading-relaxed text-muted">
          <summary className="cursor-pointer list-none rounded-md outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent">
            <span aria-hidden className="mr-1 inline-block transition-transform group-open:rotate-90">›</span>
            Where do I find the link?
          </summary>
          <ul className="mt-2 list-disc space-y-1.5 pl-5">
            <li>
              <strong className="font-medium text-foreground">Google Calendar:</strong> Settings, pick the calendar, then copy
              “Secret address in iCal format”.
            </li>
            <li>
              <strong className="font-medium text-foreground">Outlook:</strong> Settings, Calendar, Shared calendars, Publish
              a calendar, then copy the ICS link.
            </li>
            <li>
              <strong className="font-medium text-foreground">iCloud:</strong> share the calendar as a Public Calendar and
              copy its webcal:// link.
            </li>
            <li>Timetables and sports clubs often offer a “subscribe” or “.ics” link too.</li>
          </ul>
          <p className="mt-2">
            The calendar is read-only here and refreshes every half hour. Only the link&apos;s site name is shown, because
            these links are often private: keep the dashboard to yourself.
          </p>
        </details>
      </form>
    </section>
  );
}
