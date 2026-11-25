// Your to-do list, kept in SQLite. Server only; the browser uses /api/tasks.
import { db } from "./db";
import { isDay } from "./day";

export type Task = {
  id: number;
  title: string;
  /** Local date it's due (YYYY-MM-DD), or null for "someday". */
  due: string | null;
  /** When it was ticked off (Unix ms), or null while open. */
  doneAt: number | null;
  createdAt: number;
};

export const MAX_TITLE = 200;
/** Ticked-off tasks stay visible this long, then only "Clear done" or time removes them. */
const KEEP_DONE_MS = 30 * 86_400_000;

type Row = { id: number; title: string; due: string | null; done_at: number | null; created_at: number };
const toTask = (r: Row): Task => ({ id: r.id, title: r.title, due: r.due, doneAt: r.done_at, createdAt: r.created_at });

export function cleanTitle(v: unknown) {
  if (typeof v !== "string") return undefined;
  const t = v.replace(/\s+/g, " ").trim();
  return t && t.length <= MAX_TITLE ? t : undefined;
}

/** Open tasks first (by due date, undated last), then the ones done in the last 30 days. */
export async function listTasks(): Promise<Task[]> {
  const conn = await db();
  conn.prepare("DELETE FROM tasks WHERE done_at IS NOT NULL AND done_at < ?").run(Date.now() - KEEP_DONE_MS);
  const rows = conn
    .prepare(
      `SELECT * FROM tasks
       ORDER BY done_at IS NOT NULL, done_at DESC, due IS NULL, due, created_at`,
    )
    .all() as Row[];
  return rows.map(toTask);
}

export async function addTask(title: string, due: string | null): Promise<Task> {
  const now = Date.now();
  const r = (await db())
    .prepare("INSERT INTO tasks (title, due, done_at, created_at) VALUES (?, ?, NULL, ?) RETURNING *")
    .get(title, due, now) as Row;
  return toTask(r);
}

export type TaskChange = { title?: string; due?: string | null; done?: boolean };

/** Checks a PATCH body; a string means it was refused, with the reason. */
export function parseChange(body: Record<string, unknown>): TaskChange | string {
  const change: TaskChange = {};
  if ("title" in body) {
    const t = cleanTitle(body.title);
    if (!t) return `A task needs a title of at most ${MAX_TITLE} characters.`;
    change.title = t;
  }
  if ("due" in body) {
    if (body.due !== null && !isDay(body.due)) return "That isn't a valid date.";
    change.due = body.due as string | null;
  }
  if ("done" in body) {
    if (typeof body.done !== "boolean") return "done must be true or false.";
    change.done = body.done;
  }
  return change;
}

export async function updateTask(id: number, change: TaskChange): Promise<Task | undefined> {
  const conn = await db();
  const sets: string[] = [];
  const args: (string | number | null)[] = [];
  const set = (column: string, value: string | number | null) => {
    sets.push(`${column} = ?`);
    args.push(value);
  };
  if (change.title !== undefined) set("title", change.title);
  if (change.due !== undefined) set("due", change.due);
  if (change.done !== undefined) set("done_at", change.done ? Date.now() : null);
  const row = sets.length
    ? (conn.prepare(`UPDATE tasks SET ${sets.join(", ")} WHERE id = ? RETURNING *`).get(...args, id) as Row | undefined)
    : (conn.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Row | undefined);
  return row && toTask(row);
}

export async function deleteTask(id: number) {
  return (await db()).prepare("DELETE FROM tasks WHERE id = ?").run(id).changes > 0;
}

export async function clearDone() {
  (await db()).prepare("DELETE FROM tasks WHERE done_at IS NOT NULL").run();
}
