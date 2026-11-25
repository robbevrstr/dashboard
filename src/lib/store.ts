// Browser side of the settings store. Values live in the dashboard's SQLite database
// (see /api/settings), so they follow you to every browser. Anything an older version
// left in localStorage is moved to the database the first time it's read.
import type { SettingKey } from "./settings";

const url = (key: SettingKey) => `/api/settings/${encodeURIComponent(key)}`;

function fromLocalStorage(key: SettingKey): unknown {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return undefined;
    try {
      return JSON.parse(raw);
    } catch {
      return raw; // stored as a plain string, like "off"
    }
  } catch {
    return undefined;
  }
}

/** Reads a setting. Resolves to undefined when it isn't set or the server can't be reached. */
export async function loadSetting<T>(key: SettingKey, check?: (v: unknown) => v is T): Promise<T | undefined> {
  let value: unknown;
  try {
    const res = await fetch(url(key), { cache: "no-store" });
    if (!res.ok) return undefined;
    value = ((await res.json()) as { value: unknown }).value ?? undefined;
  } catch {
    return undefined;
  }
  if (value === undefined) {
    const old = fromLocalStorage(key);
    if (old !== undefined) {
      value = old;
      saveSetting(key, old);
      try {
        localStorage.removeItem(key);
      } catch {}
    }
  }
  if (value === undefined) return undefined;
  return !check || check(value) ? (value as T) : undefined;
}

/** A best score: a positive number. */
export const isScore = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;

/** Saves a setting in the background; undefined or null removes it. */
export function saveSetting(key: SettingKey, value: unknown) {
  const body = JSON.stringify({ value: value ?? null });
  fetch(url(key), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body,
    // Lets a save finish while the page closes; browsers cap such requests at 64 KB.
    keepalive: body.length < 60_000,
  }).catch(() => {
    // offline or the server is down; the next change saves again
  });
}
