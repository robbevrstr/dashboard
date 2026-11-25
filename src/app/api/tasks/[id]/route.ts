import type { NextRequest } from "next/server";
import { bad, forbidden, foreign, idOf, notFound, readJson } from "@/lib/api";
import { deleteTask, parseChange, updateTask } from "@/lib/tasks";

/** Changes a task: any of { title, due, done }. */
export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/tasks/[id]">) {
  if (foreign(request)) return forbidden();
  const id = await idOf(ctx);
  if (id === undefined) return notFound();
  const body = await readJson(request);
  if (body instanceof Response) return body;
  const change = parseChange(body);
  if (typeof change === "string") return bad(change);
  const task = await updateTask(id, change);
  return task ? Response.json({ task }) : notFound();
}

export async function DELETE(request: NextRequest, ctx: RouteContext<"/api/tasks/[id]">) {
  if (foreign(request)) return forbidden();
  const id = await idOf(ctx);
  if (id === undefined || !(await deleteTask(id))) return notFound();
  return new Response(null, { status: 204 });
}
