import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { todayDhaka } from "@/lib/dates";

// Called once a day by Vercel Cron (see vercel.json). Backup for the pg_cron job in the database,
// and the API call also keeps the free Supabase project from being paused for inactivity.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("generate_daily_meals", { p_date: todayDhaka() });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, created: data });
}
