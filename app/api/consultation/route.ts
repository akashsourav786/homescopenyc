import { NextRequest, NextResponse } from "next/server";
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
    process.env.LEAD_NOTIFY_FROM ?? "HomeScope NYC <onboarding@resend.dev>";
  const { subject, text } = buildNotificationEmail(row);
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, text }),
    });
  } catch {
    // Notification failure must never fail the submission.
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

  // Fire-and-forget: a notification hiccup never blocks the response.
  void notifyLead(verdict.row);

  return NextResponse.json({ ok: true });
}
