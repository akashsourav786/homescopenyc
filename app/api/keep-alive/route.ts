import { NextResponse } from "next/server";
import { buildKeepAliveRequest } from "@/lib/keep-alive";

/**
 * GET /api/keep-alive — invoked twice daily by Vercel Cron (see vercel.json).
 * Performs one minimal read against Supabase so the free-tier project
 * registers database activity and doesn't pause from inactivity. Public
 * and harmless: the query returns zero rows (RLS) and changes nothing.
 */
export async function GET() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  try {
    const { url: reqUrl, headers } = buildKeepAliveRequest(url, key);
    const res = await fetch(reqUrl, { headers });
    return NextResponse.json({ ok: res.ok });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
