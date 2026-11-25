"use client";

// Task list pieces shared by /apps/tasks and the dashboard tile: loading and saving
// (changes show at once and are rolled back if the server refuses them), one task row,
// and the add form.
import { useCallback, useEffect, useRef, useState } from "react";
import { addDays, daysBetween, dayLabel } from "@/lib/day";
import { request } from "@/lib/request";
import type { Task, TaskChange } from "@/lib/tasks";

export function useTasks(initial?: Task[]) {
  const [tasks, setTasks] = useState<Task[] | undefined>(initial);
  const [error, setError] = useState<string>();

  const reload = useCallback(async () => {
    const r = await request<{ tasks: Task[] }>("GET", "/api/tasks");
    if (r.ok) setTasks(r.data.tasks);
    else setError(r.error);
  }, []);

  useEffect(() => {
    // The dashboard tile hands in the list it rendered with; the tasks page loads it here.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads from the server, then sets state
    if (!initial) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Runs a request; when it fails, shows why and fetches the real list again. */
  const run = useCallback(
    async <T,>(p: ReturnType<typeof request<T>>) => {
      const r = await p;
      if (r.ok) setError(undefined);
      else {
        setError(r.error);
        reload();
      }
      return r;
    },
    [reload],
  );

  const add = useCallback(
    async (title: string, due: string | null) => {
      const r = await run(request<{ task: Task }>("POST", "/api/tasks", { title, due }));
      if (r.ok) setTasks((list) => [...(list ?? []), r.data.task]);
      return r.ok;
    },
    [run],
  );

  const update = useCallback(
    (id: number, change: TaskChange) => {
      setTasks((list) =>
        list?.map((t) =>
          t.id !== id
            ? t
            : {
                ...t,
                ...(change.title !== undefined && { title: change.title }),
                ...(change.due !== undefined && { due: change.due }),
                ...(change.done !== undefined && { doneAt: change.done ? Date.now() : null }),
              },
        ),
      );
      run(request("PATCH", `/api/tasks/${id}`, change));
    },
    [run],
  );

  const remove = useCallback(
    (id: number) => {
      setTasks((list) => list?.filter((t) => t.id !== id));
      run(request("DELETE", `/api/tasks/${id}`));
    },
    [run],
  );

  const clearDone = useCallback(() => {
    setTasks((list) => list?.filter((t) => t.doneAt === null));
    run(request("DELETE", "/api/tasks"));
  }, [run]);

  return { tasks, error, add, update, remove, clearDone };
}

/** Open tasks by due date (undated last), oldest first within a day. */
export const byDue = (a: Task, b: Task) =>
  (a.due ?? "9999") < (b.due ?? "9999") ? -1 : (a.due ?? "9999") > (b.due ?? "9999") ? 1 : a.createdAt - b.createdAt;

/** "Today", "Tomorrow", "Fri 28 Nov", or how late it is. */
export function dueText(due: string, today: string) {
  const late = daysBetween(due, today);
  if (late === 1) return "Yesterday";
  if (late > 1) return `${late} days late`;
  return dayLabel(due, today, { short: true });
}

export function TaskRow({
  task,
  today,
  onChange,
  onRemove,
  compact = false,
}: {
  task: Task;
  today: string;
  onChange: (change: TaskChange) => void;
  onRemove: () => void;
  /** On the dashboard: no editing of the title or date, only ticking off. */
  compact?: boolean;
}) {
  const done = task.doneAt !== null;
  const [editing, setEditing] = useState(false);
  const dateRef = useRef<HTMLInputElement>(null);
  const late = !done && task.due !== null && task.due < today;

  const save = (value: string) => {
    setEditing(false);
    const title = value.replace(/\s+/g, " ").trim();
    if (title && title !== task.title) onChange({ title });
  };

  const pickDate = () => {
    const input = dateRef.current;
    if (!input) return;
    try {
      input.showPicker();
    } catch {
      input.focus();
    }
  };

  return (
    <li className="group flex min-h-12 items-center gap-3 border-b border-line py-2 last:border-b-0">
      <span className="relative grid size-5 shrink-0 place-items-center">
        <input
          type="checkbox"
          checked={done}
          onChange={(e) => onChange({ done: e.target.checked })}
          aria-label={done ? `Mark “${task.title}” as not done` : `Mark “${task.title}” as done`}
          className="peer size-5 cursor-pointer appearance-none rounded-full border-[1.5px] border-muted/60 outline-none transition-colors checked:border-good-dot checked:bg-good-dot hover:border-foreground focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        />
        <svg viewBox="0 0 12 12" aria-hidden className="pointer-events-none absolute size-3 text-white opacity-0 peer-checked:opacity-100" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m2.5 6.2 2.3 2.3 4.7-4.9" />
        </svg>
      </span>

      {editing ? (
        <input
          autoFocus
          defaultValue={task.title}
          maxLength={200}
          aria-label="Task title"
          onBlur={(e) => save(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save(e.currentTarget.value);
            if (e.key === "Escape") setEditing(false);
          }}
          className="h-9 min-w-0 flex-1 rounded-lg border border-accent bg-background px-2.5 text-[15px] outline-none ring-2 ring-accent/25"
        />
      ) : compact ? (
        <span className={`min-w-0 flex-1 truncate text-[15px] ${done ? "text-muted line-through" : ""}`}>{task.title}</span>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          title="Click to edit"
          className={`min-w-0 flex-1 rounded-md py-1 text-left text-[15px] leading-snug wrap-break-word outline-none focus-visible:ring-2 focus-visible:ring-accent ${done ? "text-muted line-through" : ""}`}
        >
          {task.title}
        </button>
      )}

      {compact ? (
        task.due && !done ? (
          <span className={`shrink-0 text-[13px] ${late ? "font-medium text-poor" : task.due === today ? "font-medium text-caution" : "text-muted"}`}>
            {dueText(task.due, today)}
          </span>
        ) : null
      ) : (
        <span className="relative shrink-0">
          <button
            type="button"
            onClick={pickDate}
            className={`rounded-md px-2 py-1 text-[13px] outline-none hover:bg-faint focus-visible:ring-2 focus-visible:ring-accent ${
              late ? "text-poor" : task.due ? "text-muted" : "text-muted/0 group-hover:text-muted focus-visible:text-muted max-sm:text-muted"
            }`}
          >
            {task.due ? dueText(task.due, today) : "Add date"}
            <span className="sr-only">, change the due date</span>
          </button>
          <input
            ref={dateRef}
            type="date"
            tabIndex={-1}
            aria-hidden
            value={task.due ?? ""}
            onChange={(e) => onChange({ due: e.target.value || null })}
            className="pointer-events-none absolute right-0 bottom-0 h-0 w-0 opacity-0"
          />
        </span>
      )}

      {!compact ? (
        <button
          type="button"
          onClick={onRemove}
          className="grid size-8 shrink-0 place-items-center rounded-md text-muted outline-none hover:bg-faint hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
        >
          <span className="sr-only">Delete “{task.title}”</span>
          <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      ) : null}
    </li>
  );
}

const QUICK = [
  { label: "No date", days: null },
  { label: "Today", days: 0 },
  { label: "Tomorrow", days: 1 },
] as const;

export function AddTask({
  onAdd,
  today,
  id = "new-task",
}: {
  onAdd: (title: string, due: string | null) => Promise<boolean>;
  /** Shows the due-date choices once today's date is known. */
  today?: string;
  id?: string;
}) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t || busy) return;
    setBusy(true);
    const ok = await onAdd(t, due || null);
    setBusy(false);
    if (ok) setTitle("");
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2.5">
      <div className="flex flex-wrap gap-2">
        <label htmlFor={id} className="sr-only">
          New task
        </label>
        <input
          id={id}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          autoComplete="off"
          placeholder="Add a task"
          className="h-11 min-w-0 flex-[1_1_220px] rounded-[10px] border border-line bg-background px-3.5 text-[15px] outline-none placeholder:text-muted focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30"
        />
        <button
          type="submit"
          disabled={!title.trim() || busy}
          className="h-11 rounded-[10px] bg-foreground px-4.5 text-[15px] font-medium text-surface outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:opacity-40"
        >
          Add
        </button>
      </div>
      {today ? (
        <fieldset className="flex flex-wrap items-center gap-1.5 text-[13px]">
          <legend className="sr-only">Due</legend>
          {QUICK.map((q) => {
            const value = q.days === null ? "" : addDays(today, q.days);
            return (
              <button
                key={q.label}
                type="button"
                aria-pressed={due === value}
                onClick={() => setDue(value)}
                className="rounded-full border border-line px-3 py-1 text-muted outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-surface"
              >
                {q.label}
              </button>
            );
          })}
          <label className="flex items-center gap-2 rounded-full border border-line py-0.5 pr-1 pl-3 text-muted focus-within:ring-2 focus-within:ring-accent">
            Pick a date
            <input
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              className="rounded-full bg-transparent px-1 py-0.5 text-foreground outline-none"
            />
          </label>
        </fieldset>
      ) : null}
    </form>
  );
}
