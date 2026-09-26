import { randomUUID } from "node:crypto";

import { isAuthorizedCron } from "@/lib/cron-auth";
import { env } from "@/lib/env";
import { db } from "@/server/db";
import { resetDemoData } from "@/server/db/demo-seed";

export const maxDuration = 60;

/**
 * Daily demo reset (vercel.json cron). Deletes and recreates only rows owned by the fixed demo
 * user ids, so reviewers always start from the same demo course.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request.headers.get("authorization"), env.CRON_SECRET)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const summary = await resetDemoData(db);
    console.info("[cron] demo data reset", summary);
    return Response.json({ ok: true, summary });
  } catch (error) {
    const requestId = randomUUID();
    console.error(`[cron] ${requestId} demo reset failed`, error);
    return Response.json({ ok: false, error: "Reset failed", requestId }, { status: 500 });
  }
}
