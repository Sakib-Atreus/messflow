import { NextResponse } from "next/server";
import { runScheduledNotifications } from "@/lib/notify";

// Called every 10 minutes by the database (pg_cron + pg_net, see the roster/push migration).
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await runScheduledNotifications());
  } catch (e) {
    console.error("[notify]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
export const maxDuration = 60;
