// Browser side: calls one of the dashboard's own JSON routes.

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export async function request<T = unknown>(method: string, url: string, body?: unknown): Promise<Result<T>> {
  try {
    const res = await fetch(url, {
      method,
      cache: "no-store",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = res.status === 204 ? undefined : await res.json().catch(() => undefined);
    if (!res.ok) {
      const error = (data as { error?: string } | undefined)?.error;
      return { ok: false, error: error ?? `Something went wrong (${res.status}). Try again.` };
    }
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, error: "The dashboard's server can't be reached. Check that it's running." };
  }
}
