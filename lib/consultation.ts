/**
 * Consultation-request (Stage 9) shared logic.
 *
 * Pure functions: validation, spam-signal evaluation, and the lead row
 * shape. The API route (`app/api/consultation/route.ts`) wires these to
 * HTTP + Supabase + the optional Resend notification. Everything here is
 * unit-tested in `lib/consultation.test.ts`.
 */

/** Exact permission wording shown next to the consent checkbox. Stored verbatim per lead. */
export const CONSENT_TEXT =
  "I agree that Akash Rahman Sourav may contact me about my inquiry by email, phone, or text.";

export const INTERESTS = ["buying", "selling", "both", "exploring"] as const;
export type Interest = (typeof INTERESTS)[number];

export const INTEREST_LABELS: Record<Interest, string> = {
  buying: "Buying",
  selling: "Selling",
  both: "Buying and selling",
  exploring: "Just exploring",
};

/** Minimum seconds between form render and submit — faster is a bot. */
export const MIN_FILL_SECONDS = 3;
/** Max submissions per IP per window — more is a bot. */
export const RATE_LIMIT_MAX = 5;
export const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[+()\-.\s\d]{7,20}$/;

export interface RawSubmission {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  interest?: unknown;
  message?: unknown;
  consentGiven?: unknown;
  /** Honeypot field — real users never fill it. */
  website?: unknown;
  /** Client timestamp (ms) of when the form rendered. */
  filledAt?: unknown;
  sourcePage?: unknown;
}

export interface CleanSubmission {
  name: string;
  email: string;
  phone: string | null;
  interest: Interest;
  message: string | null;
}

export type ValidationResult =
  | { ok: true; value: CleanSubmission }
  | { ok: false; error: string };

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Field-level validation. Returns the cleaned payload or a human-readable error. */
export function validateSubmission(input: RawSubmission): ValidationResult {
  const name = str(input.name);
  const email = str(input.email);
  const phone = str(input.phone);
  const message = str(input.message);

  if (name.length < 2) return { ok: false, error: "Please enter your name." };
  if (!EMAIL_RE.test(email))
    return { ok: false, error: "Please enter a valid email address." };
  if (!(INTERESTS as readonly string[]).includes(str(input.interest)))
    return { ok: false, error: "Please choose what you're interested in." };
  if (input.consentGiven !== true)
    return {
      ok: false,
      error: "Please check the consent box so Akash can contact you.",
    };
  if (phone && !PHONE_RE.test(phone))
    return { ok: false, error: "That phone number doesn't look right." };
  if (message.length > 2000)
    return {
      ok: false,
      error: "Please keep your message under 2,000 characters.",
    };

  return {
    ok: true,
    value: {
      name: name.slice(0, 120),
      email: email.slice(0, 160),
      phone: phone ? phone.slice(0, 20) : null,
      interest: str(input.interest) as Interest,
      message: message ? message.slice(0, 2000) : null,
    },
  };
}

/** Lead row as stored in Supabase `consultation_requests`. */
export interface LeadRow {
  name: string;
  email: string;
  phone: string | null;
  interest: Interest;
  message: string | null;
  consent_given: true;
  consent_at: string;
  consent_text: string;
  source_page: string | null;
  user_agent: string | null;
  status: "new";
}

// --- Rate limiting (in-memory per server instance; first layer of defense) ---

const _hits = new Map<string, number[]>();

/** Returns true when this IP has exceeded the submission budget. */
export function isRateLimited(ip: string, nowMs: number): boolean {
  const recent = (_hits.get(ip) ?? []).filter(
    (t) => nowMs - t < RATE_LIMIT_WINDOW_MS,
  );
  if (recent.length >= RATE_LIMIT_MAX) return true;
  recent.push(nowMs);
  _hits.set(ip, recent);
  return false;
}

/** @internal — test isolation. */
export function _resetRateLimits(): void {
  _hits.clear();
}

// --- Submission evaluation ---

export interface SubmissionContext {
  ip: string;
  userAgent: string | null;
  nowMs: number;
}

export type SubmissionVerdict =
  /** Honeypot tripped: pretend success, store nothing. */
  | { action: "ignore" }
  | { action: "reject"; status: 400 | 429; error: string }
  | { action: "accept"; row: LeadRow };

/**
 * Runs every spam/validation check in order and builds the lead row.
 * Never touches the network — the route handles storage + notification.
 */
export function evaluateSubmission(
  body: unknown,
  ctx: SubmissionContext,
): SubmissionVerdict {
  const input = (body ?? {}) as RawSubmission;

  // 1. Honeypot — bots fill hidden fields; fail silently so they learn nothing.
  if (str(input.website) !== "") return { action: "ignore" };

  // 2. Minimum fill time — no human completes the form in under 3 seconds.
  // A missing/invalid timestamp is itself a tamper signal: reject it.
  const filledAt = input.filledAt;
  if (
    typeof filledAt !== "number" ||
    !Number.isFinite(filledAt) ||
    filledAt <= 0 ||
    ctx.nowMs - filledAt < MIN_FILL_SECONDS * 1000
  ) {
    return {
      action: "reject",
      status: 400,
      error: "Please take a moment to complete the form.",
    };
  }

  // 3. Rate limit per IP.
  if (isRateLimited(ctx.ip, ctx.nowMs)) {
    return {
      action: "reject",
      status: 429,
      error: "Too many requests. Please try again later.",
    };
  }

  // 4. Field validation + explicit consent.
  const v = validateSubmission(input);
  if (!v.ok) return { action: "reject", status: 400, error: v.error };

  const consentAt = new Date(ctx.nowMs).toISOString();
  return {
    action: "accept",
    row: {
      name: v.value.name,
      email: v.value.email,
      phone: v.value.phone,
      interest: v.value.interest,
      message: v.value.message,
      consent_given: true,
      consent_at: consentAt,
      consent_text: CONSENT_TEXT,
      source_page:
        typeof input.sourcePage === "string" && input.sourcePage.trim()
          ? input.sourcePage.trim().slice(0, 200)
          : null,
      user_agent: ctx.userAgent ? ctx.userAgent.slice(0, 300) : null,
      status: "new",
    },
  };
}

/**
 * Builds the PostgREST insert request for a lead row.
 * Pure (no network) so the URL/headers/body are unit-testable.
 *
 * Header rule (verified live 2026-10-14): send the key ONLY as `apikey`.
 * Supabase's publishable keys (sb_publishable_...) are NOT JWTs — sending
 * one as `Authorization: Bearer` makes PostgREST resolve the request to a
 * role with no matching RLS policy, so every insert fails with 42501 even
 * though the anon policy and grant are correct. apikey-only works.
 */
export function buildInsertRequest(
  supabaseUrl: string,
  anonKey: string,
  row: LeadRow,
): { url: string; headers: Record<string, string>; body: string } {
  return {
    url: `${supabaseUrl.replace(/\/$/, "")}/rest/v1/consultation_requests`,
    headers: {
      apikey: anonKey,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(row),
  };
}

/** Plain-text notification email for a new lead. */
export function buildNotificationEmail(row: LeadRow): {
  subject: string;
  text: string;
} {
  const lines = [
    "New consultation request — RahmanRealty PropertyLab",
    "",
    `Name: ${row.name}`,
    `Email: ${row.email}`,
    `Phone: ${row.phone ?? "—"}`,
    `Interested in: ${INTEREST_LABELS[row.interest]}`,
    `Message: ${row.message ?? "—"}`,
    "",
    `Consent: given at ${row.consent_at}`,
    `"${row.consent_text}"`,
    `Source page: ${row.source_page ?? "—"}`,
  ];
  return {
    subject: `New consultation request — ${row.name}`,
    text: lines.join("\n"),
  };
}
