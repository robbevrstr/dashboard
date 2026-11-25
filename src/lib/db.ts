// One SQLite file for everything the dashboard keeps: price history, settings, tasks and the agenda.
// Uses Node's built-in node:sqlite. The folder is DATA_DIR (default ./data), which is a
// volume when running in Docker.
import { existsSync, mkdirSync, renameSync } from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";

// Decided at runtime, so the build shouldn't try to trace (and bundle) whatever is in it.
export const DATA_DIR = path.resolve(/*turbopackIgnore: true*/ process.env.DATA_DIR || path.join(process.cwd(), "data"));
const FILE = path.join(DATA_DIR, "dashboard.sqlite");
/** The file had this name before settings moved in; picked up once so old history isn't lost. */
const OLD_FILE = path.join(DATA_DIR, "comparer.sqlite");

const g = globalThis as unknown as { __dashboardDb?: DatabaseSync };

export async function db() {
  if (g.__dashboardDb) return g.__dashboardDb;
  const { DatabaseSync } = await import("node:sqlite");
  mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(FILE) && existsSync(OLD_FILE)) renameSync(OLD_FILE, FILE);
  const conn = new DatabaseSync(FILE);
  conn.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS price_points (
      id INTEGER PRIMARY KEY,
      query_key TEXT NOT NULL,
      checked_at INTEGER NOT NULL,
      lowest REAL NOT NULL,
      lowest_new REAL,
      retailer TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS price_points_query ON price_points (query_key, checked_at);
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    -- due is a local date (YYYY-MM-DD) or NULL for "someday"; done_at is NULL while open.
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      due TEXT,
      done_at INTEGER,
      created_at INTEGER NOT NULL
    );
    -- Events you add yourself. Times are Unix ms; all-day events store local midnights.
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      start INTEGER NOT NULL,
      end INTEGER NOT NULL,
      all_day INTEGER NOT NULL DEFAULT 0,
      location TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS events_start ON events (start);
    -- Calendars imported from a link (iCal / ICS). The feed is kept as fetched and parsed on read.
    CREATE TABLE IF NOT EXISTS calendars (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      color TEXT NOT NULL,
      ics TEXT NOT NULL,
      fetched_at INTEGER NOT NULL, -- last successful download
      checked_at INTEGER NOT NULL, -- last attempt; error says why it failed
      error TEXT,
      created_at INTEGER NOT NULL
    );
  `);
  g.__dashboardDb = conn;
  return conn;
}
