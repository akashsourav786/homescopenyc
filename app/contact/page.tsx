import type { Metadata } from "next";
import { Building2, Info, Mail, Phone } from "lucide-react";
import { Container } from "@/components/container";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Contact Akash" };

/**
 * Labeled placeholders — no invented phone numbers or email addresses.
 * Real contact details arrive after Akash provides them.
 */
const CONTACT_METHODS = [
  {
    icon: Phone,
    tile: "bg-pastel-mint",
    ink: "text-pastel-mint-ink",
    label: "Call or text",
    value: "To be provided",
  },
  {
    icon: Mail,
    tile: "bg-pastel-blue",
    ink: "text-pastel-blue-ink",
    label: "Email",
    value: "To be provided",
  },
  {
    icon: Building2,
    tile: "bg-pastel-lavender",
    ink: "text-pastel-lavender-ink",
    label: "EXIT Realty DKC office",
    value: "To be provided",
  },
];

export default function ContactPage() {
  return (
    <Container className="max-w-2xl">
      {/* ---------- Page header ---------- */}
      <section className="pt-8 sm:pt-12">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
          Get in touch
        </p>
        <h1 className="mt-2 text-[32px] font-extrabold leading-[1.15] tracking-tight sm:text-4xl">
          Contact Akash
        </h1>
        <p className="mt-3 max-w-md text-[15px] leading-relaxed text-muted">
          Have a question about buying or selling in NYC? I&apos;d love to
          hear from you.
        </p>
      </section>

      {/* ---------- Contact methods ---------- */}
      <section aria-label="Contact methods" className="mt-6">
        <ul className="grid gap-3">
          {CONTACT_METHODS.map(({ icon: Icon, tile, ink, label, value }) => (
            <li key={label}>
              <Card className="flex items-center gap-4 p-5">
                <span
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tile} ${ink}`}
                >
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                    {label}
                  </p>
                  <p className="mt-0.5 text-[15px] font-semibold">{value}</p>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      {/* ---------- Consultation note ---------- */}
      <section aria-label="Consultation requests" className="mt-6 pb-12 sm:pb-16">
        <Card className="flex gap-4 p-5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-pastel-peach text-pastel-peach-ink">
            <Info className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-bold tracking-tight">
              Prefer to book online?
            </p>
            <p className="mt-1 text-[14px] leading-relaxed text-muted">
              A short consultation request form is coming soon. For now,
              reach out directly using any method above — and mention your
              preferred contact method (call, text, or email) and the best
              time to reach you.
            </p>
          </div>
        </Card>
      </section>
    </Container>
  );
}
