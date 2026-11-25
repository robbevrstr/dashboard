// Local calendar days as "YYYY-MM-DD" strings. Used on both sides: the server runs in
// TZ (Europe/Brussels in Docker), the browser in your own time zone, normally the same one.

const pad = (n: number) => String(n).padStart(2, "0");

export const isDay = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && dayKey(dayStart(v)) === v; // rejects 2026-02-31

/** The local day a moment falls on. */
export function dayKey(t: number | Date) {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local midnight at the start of a day. */
export function dayStart(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

export function addDays(day: string, n: number) {
  const [y, m, d] = day.split("-").map(Number);
  return dayKey(new Date(y, m - 1, d + n));
}

/** Whole days from a to b (b later is positive). */
export function daysBetween(a: string, b: string) {
  return Math.round((dayStart(b) - dayStart(a)) / 86_400_000);
}

export const clock = (t: number) => new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

/** "Today", "Tomorrow", "Yesterday", or "Friday 28 November" (with the year when it isn't this year). */
export function dayLabel(day: string, today: string, { short = false } = {}) {
  const diff = daysBetween(today, day);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  const date = new Date(dayStart(day));
  const sameYear = day.slice(0, 4) === today.slice(0, 4);
  return date.toLocaleDateString("en-GB", {
    weekday: short ? "short" : "long",
    day: "numeric",
    month: short ? "short" : "long",
    year: sameYear ? undefined : "numeric",
  });
}
