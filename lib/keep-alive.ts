/**
 * Keep-alive for the Supabase free tier.
 *
 * Free projects pause after a week of inactivity, which would take the
 * consultation form down (submissions fail, no lead, no notification).
 * Supabase counts roughly "a few database requests a day" as active, so a
 * Vercel Cron hits the keep-alive route twice a day (see vercel.json).
 * The query is a read-only `select id limit 1` — RLS returns zero rows to
 * anon, but the query still executes against the database, which is the
 * activity signal that matters.
 *
 * Same header rule as the consultation insert (see lib/consultation.ts):
 * apikey only, never `Authorization: Bearer` with a publishable key.
 */

export function buildKeepAliveRequest(
  supabaseUrl: string,
  anonKey: string,
): { url: string; headers: Record<string, string> } {
  return {
    url: `${supabaseUrl.replace(/\/$/, "")}/rest/v1/consultation_requests?select=id&limit=1`,
    headers: { apikey: anonKey },
  };
}
