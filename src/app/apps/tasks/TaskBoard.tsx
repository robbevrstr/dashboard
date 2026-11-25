"use client";

import { useEffect, useState } from "react";
import { AddTask, byDue, TaskRow, useTasks } from "@/components/tasks/tasks";
import { addDays, dayKey } from "@/lib/day";
import type { Task } from "@/lib/tasks";

type Group = { id: string; title: string; tasks: Task[]; tone?: "poor" };

function groups(tasks: Task[], today: string): Group[] {
  const open = tasks.filter((t) => t.doneAt === null).sort(byDue);
  const tomorrow = addDays(today, 1);
  return [
    { id: "late", title: "Overdue", tasks: open.filter((t) => t.due !== null && t.due < today), tone: "poor" as const },
    { id: "today", title: "Today", tasks: open.filter((t) => t.due === today) },
    { id: "tomorrow", title: "Tomorrow", tasks: open.filter((t) => t.due === tomorrow) },
    { id: "later", title: "Later", tasks: open.filter((t) => t.due !== null && t.due > tomorrow) },
    { id: "someday", title: "No date", tasks: open.filter((t) => t.due === null) },
  ].filter((g) => g.tasks.length);
}

/** Today's date, refreshed when the tab comes back so "today" doesn't go stale overnight. */
function useToday() {
  const [today, setToday] = useState<string>();
  useEffect(() => {
    const update = () => setToday(dayKey(Date.now()));
    update(); // the date is only known in the browser
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return today;
}

export function TaskBoard() {
  const { tasks, error, add, update, remove, clearDone } = useTasks();
  const today = useToday();
  const [showDone, setShowDone] = useState(false);

  const done = (tasks ?? []).filter((t) => t.doneAt !== null).sort((a, b) => b.doneAt! - a.doneAt!);
  const list = tasks && today ? groups(tasks, today) : undefined;
  const openCount = (tasks ?? []).length - done.length;

  return (
    <div className="mt-10 grid gap-6 pb-20 lg:grid-cols-[1fr_300px] lg:items-start">
      <section aria-label="Your tasks" className="panel min-w-0 p-5 sm:p-6">
        <AddTask onAdd={add} today={today} />
        {error ? <p className="mt-4 rounded-lg bg-poor/10 px-3 py-2 text-sm text-poor">{error}</p> : null}

        {!list ? (
          <div className="mt-8 space-y-3" aria-busy>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded-lg bg-faint motion-reduce:animate-none" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <p className="mt-10 mb-4 text-center text-[15px] text-muted">
            {done.length ? "All done. Nice." : "Nothing to do yet. Add your first task above."}
          </p>
        ) : (
          list.map((g) => (
            <section key={g.id} aria-labelledby={`group-${g.id}`} className="mt-8">
              <h2 id={`group-${g.id}`} className={`text-[13px] font-semibold ${g.tone === "poor" ? "text-poor" : "text-muted"}`}>
                {g.title} <span className="font-normal">{g.tasks.length}</span>
              </h2>
              <ul className="mt-1">
                {g.tasks.map((t) => (
                  <TaskRow key={t.id} task={t} today={today!} onChange={(c) => update(t.id, c)} onRemove={() => remove(t.id)} />
                ))}
              </ul>
            </section>
          ))
        )}

        {done.length ? (
          <section aria-label="Done" className="mt-8 border-t border-line pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
              <button
                type="button"
                aria-expanded={showDone}
                onClick={() => setShowDone((s) => !s)}
                className="flex items-center gap-1.5 rounded-md font-semibold text-muted outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent"
              >
                <svg viewBox="0 0 12 12" aria-hidden className={`size-3 transition-transform ${showDone ? "rotate-90" : ""}`} fill="currentColor">
                  <path d="M4 2.5 8 6l-4 3.5z" />
                </svg>
                Done <span className="font-normal">{done.length}</span>
              </button>
              <button type="button" onClick={clearDone} className="rounded-md text-muted underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-accent">
                Clear done
              </button>
            </div>
            {showDone && today ? (
              <ul className="mt-1">
                {done.map((t) => (
                  <TaskRow key={t.id} task={t} today={today} onChange={(c) => update(t.id, c)} onRemove={() => remove(t.id)} />
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}
      </section>

      <aside className="panel p-5 text-[15px] sm:p-6">
        <h2 className="text-[15px] font-semibold tracking-tight">At a glance</h2>
        <dl className="mt-4 grid grid-cols-2 gap-4">
          <Count label="Open" value={tasks ? openCount : undefined} />
          <Count label="Overdue" value={list ? (list.find((g) => g.id === "late")?.tasks.length ?? 0) : undefined} poor />
          <Count label="Due today" value={list ? (list.find((g) => g.id === "today")?.tasks.length ?? 0) : undefined} />
          <Count label="Done, 30 days" value={tasks ? done.length : undefined} />
        </dl>
        <p className="mt-5 border-t border-line pt-4 text-[13px] leading-relaxed text-muted">
          Click a task to rename it, or its date to move it. Ticked-off tasks stay here for 30 days. Open tasks also
          show on the dashboard.
        </p>
      </aside>
    </div>
  );
}

function Count({ label, value, poor }: { label: string; value?: number; poor?: boolean }) {
  return (
    <div>
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className={`readout mt-0.5 text-[28px] font-semibold ${poor && value ? "text-poor" : ""}`}>{value ?? "–"}</dd>
    </div>
  );
}
