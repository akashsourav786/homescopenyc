"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CONSENT_TEXT, INTERESTS, INTEREST_LABELS } from "@/lib/consultation";

const inputCls =
  "w-full rounded-xl border border-border bg-card px-4 py-3 text-[15px] text-foreground " +
  "placeholder:text-muted focus:outline-2 focus:outline-offset-1 focus:outline-ring";

type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "done" }
  | { kind: "error"; message: string };

/** Stage 9: permission-based consultation request form. Posts to /api/consultation. */
export function ConsultationForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [interest, setInterest] = useState<string>("");
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState(""); // honeypot — humans never see it
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  // Spam signal: minimum fill time. Set on mount so it measures how long
  // the form was actually visible in the browser.
  const filledAt = useRef<number>(0);
  useEffect(() => {
    filledAt.current = Date.now();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status.kind === "sending") return;
    setStatus({ kind: "sending" });
    try {
      const res = await fetch("/api/consultation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          phone,
          interest,
          message,
          consentGiven: consent,
          website,
          filledAt: filledAt.current,
          sourcePage:
            typeof document !== "undefined" ? document.referrer || null : null,
        }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (data.ok) {
        setStatus({ kind: "done" });
      } else {
        setStatus({
          kind: "error",
          message: data.error ?? "Something went wrong. Please try again.",
        });
      }
    } catch {
      setStatus({
        kind: "error",
        message: "Couldn't reach the server. Check your connection and retry.",
      });
    }
  }

  if (status.kind === "done") {
    return (
      <Card className="p-6 text-center sm:p-8" role="status">
        <CheckCircle2
          className="mx-auto h-10 w-10 text-accent"
          aria-hidden
        />
        <h2 className="mt-4 font-display text-2xl font-extrabold tracking-tight">
          Request received
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-[15px] leading-relaxed text-muted">
          Thanks, {name.split(" ")[0] || "there"} — Akash will be in touch
          shortly at {email}.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-6 sm:p-8">
      <h2 className="font-display text-2xl font-extrabold tracking-tight">
        Request a consultation
      </h2>
      <p className="mt-2 text-[14px] leading-relaxed text-muted">
        Tell me what you&apos;re thinking — buying, selling, or just
        exploring. No spam, no pressure.
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
        {/* Honeypot: positioned off-screen (not display:none) so bots fill it. */}
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="absolute -left-[9999px] h-px w-px opacity-0"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />

        <div>
          <label htmlFor="cf-name" className="mb-1.5 block text-[13px] font-semibold">
            Name
          </label>
          <input
            id="cf-name"
            type="text"
            required
            autoComplete="name"
            placeholder="Jane Buyer"
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="cf-email" className="mb-1.5 block text-[13px] font-semibold">
              Email
            </label>
            <input
              id="cf-email"
              type="email"
              required
              autoComplete="email"
              placeholder="jane@example.com"
              className={inputCls}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="cf-phone" className="mb-1.5 block text-[13px] font-semibold">
              Phone <span className="font-normal text-muted">(optional)</span>
            </label>
            <input
              id="cf-phone"
              type="tel"
              autoComplete="tel"
              placeholder="(718) 555-0100"
              className={inputCls}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label htmlFor="cf-interest" className="mb-1.5 block text-[13px] font-semibold">
            I&apos;m interested in
          </label>
          <select
            id="cf-interest"
            required
            className={inputCls}
            value={interest}
            onChange={(e) => setInterest(e.target.value)}
          >
            <option value="" disabled>
              Choose one
            </option>
            {INTERESTS.map((i) => (
              <option key={i} value={i}>
                {INTEREST_LABELS[i]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="cf-message" className="mb-1.5 block text-[13px] font-semibold">
            Message <span className="font-normal text-muted">(optional)</span>
          </label>
          <textarea
            id="cf-message"
            rows={4}
            placeholder="A 2-bedroom in the Bronx, hoping to buy this spring…"
            className={`${inputCls} resize-y`}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>

        <label
          htmlFor="cf-consent"
          className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-accent-soft/40 p-4"
        >
          <input
            id="cf-consent"
            type="checkbox"
            required
            className="mt-0.5 h-5 w-5 shrink-0 accent-[#008C99]"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          <span className="text-[13px] leading-relaxed">{CONSENT_TEXT}</span>
        </label>

        {status.kind === "error" && (
          <p role="alert" className="text-[14px] font-medium text-red-600 dark:text-red-400">
            {status.message}
          </p>
        )}

        <Button
          type="submit"
          size="lg"
          className="w-full rounded-full"
          disabled={status.kind === "sending"}
        >
          {status.kind === "sending" ? "Sending…" : "Send request"}
        </Button>

        <p className="text-center text-[12px] text-muted">
          Your details go only to Akash — never sold, never shared.
        </p>
      </form>
    </Card>
  );
}
