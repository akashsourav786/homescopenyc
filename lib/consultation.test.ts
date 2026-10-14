import { beforeEach, describe, expect, it } from "vitest";
import {
  CONSENT_TEXT,
  _resetRateLimits,
  buildInsertRequest,
  buildNotificationEmail,
  evaluateSubmission,
  validateSubmission,
  type SubmissionContext,
} from "./consultation";

const GOOD_BODY = {
  name: "  Jane Buyer ",
  email: "jane@example.com",
  phone: "(718) 555-0100",
  interest: "buying",
  message: "Looking for a 2bd in the Bronx.",
  consentGiven: true,
  website: "",
  filledAt: 0, // overridden per test
  sourcePage: "/buying-power",
};

function ctx(ip: string, nowMs = 1_000_000): SubmissionContext {
  return { ip, userAgent: "test-agent", nowMs };
}

function goodBody(filledAgoMs = 10_000) {
  return { ...GOOD_BODY, filledAt: 1_000_000 - filledAgoMs };
}

describe("validateSubmission", () => {
  it("accepts a complete valid submission and trims fields", () => {
    const r = validateSubmission({ ...GOOD_BODY });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.name).toBe("Jane Buyer");
      expect(r.value.email).toBe("jane@example.com");
      expect(r.value.interest).toBe("buying");
    }
  });

  it("nulls optional fields when empty", () => {
    const r = validateSubmission({
      name: "Al",
      email: "a@b.co",
      interest: "exploring",
      consentGiven: true,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.phone).toBeNull();
      expect(r.value.message).toBeNull();
    }
  });

  it("rejects a missing name", () => {
    const r = validateSubmission({ ...GOOD_BODY, name: " " });
    expect(r).toEqual({ ok: false, error: "Please enter your name." });
  });

  it("rejects a bad email", () => {
    const r = validateSubmission({ ...GOOD_BODY, email: "not-an-email" });
    expect(r.ok).toBe(false);
  });

  it("rejects an unknown interest", () => {
    const r = validateSubmission({ ...GOOD_BODY, interest: "renting" });
    expect(r.ok).toBe(false);
  });

  it("requires explicit consent", () => {
    const r = validateSubmission({ ...GOOD_BODY, consentGiven: false });
    expect(r).toEqual({
      ok: false,
      error: "Please check the consent box so Akash can contact you.",
    });
  });

  it("rejects a malformed phone number", () => {
    const r = validateSubmission({ ...GOOD_BODY, phone: "abc" });
    expect(r.ok).toBe(false);
  });
});

describe("evaluateSubmission", () => {
  beforeEach(() => _resetRateLimits());

  it("ignores honeypot submissions silently", () => {
    const v = evaluateSubmission(
      { ...goodBody(), website: "http://spam.example" },
      ctx("ip-honeypot"),
    );
    expect(v).toEqual({ action: "ignore" });
  });

  it("rejects submissions faster than the minimum fill time", () => {
    const v = evaluateSubmission(
      { ...GOOD_BODY, filledAt: 1_000_000 - 500 },
      ctx("ip-fast"),
    );
    expect(v).toEqual({
      action: "reject",
      status: 400,
      error: "Please take a moment to complete the form.",
    });
  });

  it("rejects a missing fill timestamp", () => {
    const noStamp: Record<string, unknown> = { ...goodBody() };
    delete noStamp.filledAt;
    const v = evaluateSubmission(noStamp, ctx("ip-nostamp"));
    expect(v).toMatchObject({ action: "reject", status: 400 });
  });

  it("rate-limits after 5 submissions per hour per IP", () => {
    const ip = "ip-ratelimit";
    for (let i = 0; i < 5; i++) {
      const v = evaluateSubmission(goodBody(), ctx(ip, 1_000_000 + i * 1000));
      expect(v.action).toBe("accept");
    }
    const sixth = evaluateSubmission(goodBody(), ctx(ip, 1_000_000 + 6000));
    expect(sixth).toEqual({
      action: "reject",
      status: 429,
      error: "Too many requests. Please try again later.",
    });
  });

  it("builds a complete lead row on accept", () => {
    const v = evaluateSubmission(goodBody(), ctx("ip-accept"));
    expect(v.action).toBe("accept");
    if (v.action === "accept") {
      expect(v.row.name).toBe("Jane Buyer");
      expect(v.row.email).toBe("jane@example.com");
      expect(v.row.consent_given).toBe(true);
      expect(v.row.consent_text).toBe(CONSENT_TEXT);
      expect(v.row.consent_at).toBe(new Date(1_000_000).toISOString());
      expect(v.row.source_page).toBe("/buying-power");
      expect(v.row.user_agent).toBe("test-agent");
      expect(v.row.status).toBe("new");
    }
  });

  it("rejects invalid fields with their message", () => {
    const v = evaluateSubmission(
      { ...goodBody(), email: "bad" },
      ctx("ip-badfield"),
    );
    expect(v).toMatchObject({ action: "reject", status: 400 });
  });
});

describe("buildInsertRequest", () => {
  it("targets the PostgREST table with the anon key headers", () => {
    const row = evaluateSubmission(goodBody(), ctx("ip-req"));
    expect(row.action).toBe("accept");
    if (row.action !== "accept") return;
    const req = buildInsertRequest(
      "https://xyz.supabase.co/",
      "test-anon-key",
      row.row,
    );
    expect(req.url).toBe(
      "https://xyz.supabase.co/rest/v1/consultation_requests",
    );
    expect(req.headers.apikey).toBe("test-anon-key");
    // No Authorization header: publishable keys are not JWTs, and sending
    // one as Bearer breaks PostgREST role resolution (live-verified 42501).
    expect(req.headers.Authorization).toBeUndefined();
    expect(req.headers.Prefer).toBe("return=minimal");
    const parsed = JSON.parse(req.body);
    expect(parsed.email).toBe("jane@example.com");
    expect(parsed.consent_given).toBe(true);
  });
});

describe("buildNotificationEmail", () => {
  it("names the lead in the subject and records consent in the body", () => {
    const v = evaluateSubmission(goodBody(), ctx("ip-email"));
    expect(v.action).toBe("accept");
    if (v.action !== "accept") return;
    const { subject, text } = buildNotificationEmail(v.row);
    expect(subject).toContain("Jane Buyer");
    expect(text).toContain("jane@example.com");
    expect(text).toContain("Buying");
    expect(text).toContain(CONSENT_TEXT);
  });
});
