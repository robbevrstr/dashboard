"use client";

import Link from "next/link";
import { useState } from "react";
import { AddTask, byDue, TaskRow, useTasks } from "@/components/tasks/tasks";
import type { Task } from "@/lib/tasks";

const MAX_SHOWN = 7;

/** Deadlines (tasks with a date) first, then the rest, with a box to add one. Ticked tasks stay until the page reloads. */
export function TasksTileBody({ initial, today }: { initial: Task[]; today: string }) {
  const { tasks = [], error, add, update } = useTasks(initial);
  // Tasks ticked off while the page is open stay in place (struck through), so a slip can be undone.
  const [since] = useState(() => Date.now());
  const open = tasks.filter((t) => t.doneAt === null || t.doneAt >= since).sort(byDue);
  const shown = open.slice(0, MAX_SHOWN);
  const deadlines = shown.filter((t) => t.due !== null);
  const undated = shown.filter((t) => t.due === null);
  const late = open.filter((t) => t.doneAt === null && t.due !== null && t.due < today).length;
  const dueToday = open.filter((t) => t.doneAt === null && t.due === today).length;
  const summary = [late && `${late} overdue`, dueToday && `${dueToday} due today`].filter(Boolean).join(", ");

  return (
    <>
      {summary ? <p className={`-mt-1 mb-2 text-[13px] ${late ? "text-poor" : "text-muted"}`}>{summary}</p> : null}
      {shown.length ? (
        <div className="-mt-1 space-y-4">
          {[
            { label: "Deadlines", list: deadlines },
            { label: "No date", list: undated },
          ].map(({ label, list }) =>
            list.length ? (
              <section key={label} aria-label={label}>
                {deadlines.length ? <h3 className="text-[13px] font-semibold text-muted">{label}</h3> : null}
                <ul className={deadlines.length ? "mt-1" : ""}>
                  {list.map((t) => (
                    <TaskRow key={t.id} task={t} today={today} compact onChange={(c) => update(t.id, c)} onRemove={() => {}} />
                  ))}
                </ul>
              </section>
            ) : null,
          )}
        </div>
      ) : (
        <p className="text-[15px] leading-relaxed text-muted">Nothing to do. Add a task below, or plan ahead on the tasks page.</p>
      )}
      {open.length > shown.length ? (
        <p className="mt-2 text-[13px] text-muted">
          <Link href="/apps/tasks" className="underline underline-offset-[3px] hover:text-foreground">
            {open.length - shown.length} more
          </Link>
        </p>
      ) : null}
      {error ? <p className="mt-2 text-[13px] text-poor">{error}</p> : null}
      <div className="mt-auto pt-5">
        <AddTask onAdd={add} id="tile-task" />
      </div>
    </>
  );
}
