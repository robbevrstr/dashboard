import type { NextRequest } from "next/server";
import { bad, forbidden, foreign, NO_STORE, readJson } from "@/lib/api";
import { isDay } from "@/lib/day";
import { addTask, cleanTitle, clearDone, listTasks, MAX_TITLE } from "@/lib/tasks";

export async function GET(request: NextRequest) {
  if (foreign(request)) return forbidden();
  return Response.json({ tasks: await listTasks() }, { headers: NO_STORE });
}

/** Adds a task: { title, due?: "YYYY-MM-DD" | null }. */
export async function POST(request: NextRequest) {
  if (foreign(request)) return forbidden();
  const body = await readJson(request);
  if (body instanceof Response) return body;
  const title = cleanTitle(body.title);
  if (!title) return bad(`A task needs a title of at most ${MAX_TITLE} characters.`);
  const due = body.due ?? null;
  if (due !== null && !isDay(due)) return bad("That isn't a valid date.");
  return Response.json({ task: await addTask(title, due) }, { status: 201 });
}

/** Removes every ticked-off task. */
export async function DELETE(request: NextRequest) {
  if (foreign(request)) return forbidden();
  await clearDone();
  return new Response(null, { status: 204 });
}
