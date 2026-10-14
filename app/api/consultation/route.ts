import { NextRequest, NextResponse, after } from "next/server";
import {
  buildInsertRequest,
  buildNotificationEmail,
  evaluateSubmission,
  type LeadRow,
} from "@/lib/consultation";

function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
  );
}

async function insertLead(row: LeadRow): Promise<boolean> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return false;
  try {
    const { url: reqUrl, headers, body } = buildInsertRequest(url, key, row);
    const res = await fetch(reqUrl, { method: "POST", headers, body });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Instant email notification via Resend. Env-gated: without
 * RESEND_API_KEY + LEAD_NOTIFY_EMAIL this is a silent no-op, so the form
 * works with storage-only until Akash enables it.
 */
async function notifyLead(row: LeadRow): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.LEAD_NOTIFY_EMAIL;
  if (!apiKey || !to) return;
  const from =
    process.env.LEAD_NOTIFY_FROM ?? "RahmanRealty PropertyLab <onboarding@resend.dev>";
  const { subject, text } = buildNotificationEmail(row);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, text }),
    });
    if (!res.ok) {
      // Visible in Vercel function logs — Resend failures were previously
      // swallowed entirely, making "no email, no error" impossible to debug.
      const detail = (await res.text()).slice(0, 300);
      console.error(`Lead notification failed: Resend ${res.status} ${detail}`);
    }
  } catch (err) {
    console.error("Lead notification failed: network error", err);
  }
}

export async function POST(req: NextRequest) {
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request." },
      { status: 400 },
    );
  }

  const verdict = evaluateSubmission(body, {
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
    nowMs: Date.now(),
  });

  // Honeypot: pretend everything is fine, store nothing.
  if (verdict.action === "ignore") return NextResponse.json({ ok: true });

  if (verdict.action === "reject") {
    return NextResponse.json(
      { ok: false, error: verdict.error },
      { status: verdict.status },
    );
  }

  const stored = await insertLead(verdict.row);
  if (!stored) {
    return NextResponse.json(
      {
        ok: false,
        error: "Couldn't save your request right now. Please try again.",
      },
      { status: 500 },
    );
  }

  // Runs after the response is sent, and Vercel waits for it — a plain
  // fire-and-forget fetch can be cut off when the function shuts down,
  // which silently dropped notifications with nothing in Resend's logs.
  after(() => notifyLead(verdict.row));

  return NextResponse.json({ ok: true });
}
