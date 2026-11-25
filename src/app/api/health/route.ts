import { connection } from "next/server";
import { db } from "@/lib/db";

/** Used by the Docker health check: the server answers and the database opens. */
export async function GET() {
  await connection();
  try {
    (await db()).prepare("SELECT 1").get();
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
