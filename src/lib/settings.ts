// Server side of the settings store: saved items, your place, best scores and so on,
// kept in SQLite so they're the same in every browser that opens the dashboard.
import { db } from "./db";

/** Every key the browser may read or write. Anything else is refused. */
export const SETTING_KEYS = [
  "comparer:saved",
  "bike-place",
  "bike-activity",
  "stop-the-clock-best",
  "colour-memory-best",
  "how-round-best",
  "saucer-game-best",
  "robot",
  "agenda-view",
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];

export const isSettingKey = (k: string): k is SettingKey => (SETTING_KEYS as readonly string[]).includes(k);

/** The stored JSON value, parsed, or undefined when it was never set. */
export async function getSetting<T = unknown>(key: SettingKey): Promise<T | undefined> {
  const row = (await db()).prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  if (!row) return undefined;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return undefined;
  }
}

export async function setSetting(key: SettingKey, value: unknown) {
  (await db())
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .run(key, JSON.stringify(value), Date.now());
}

export async function deleteSetting(key: SettingKey) {
  (await db()).prepare("DELETE FROM settings WHERE key = ?").run(key);
}
