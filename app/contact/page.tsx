import type { Metadata } from "next";
import { AtSign, Building2, Mail, Phone } from "lucide-react";
import { Container } from "@/components/container";
import { Card } from "@/components/ui/card";
import { ConsultationForm } from "@/components/consultation-form";

export const metadata: Metadata = { title: "Contact Akash" };

/** Akash's real contact details, from his business card. */
const CONTACT_METHODS = [
  {
    icon: Phone,
    tile: "bg-pastel-mint",
    ink: "text-pastel-mint-ink",
    label: "Call or text",
    value: "631-833-3320",
    href: "tel:+16318333320",
  },
  {
    icon: Mail,
    tile: "bg-pastel-blue",
    ink: "text-pastel-blue-ink",
    label: "Email",
    value: "rahmanrealty786@gmail.com",
    href: "mailto:rahmanrealty786@gmail.com",
  },
  {
    icon: Building2,
    tile: "bg-pastel-lavender",
    ink: "text-pastel-lavender-ink",
    label: "EXIT Realty DKC office",
    value: "3825 E Tremont Ave, Bronx, NY 10465",
    href: "https://www.google.com/maps/search/?api=1&query=3825+E+Tremont+Ave+Bronx+NY+10465",
  },
  {
    icon: AtSign,
    tile: "bg-pastel-peach",
    ink: "text-pastel-peach-ink",
    label: "Instagram",
    value: "@rahmanrealty",
    href: "https://instagram.com/rahmanrealty",
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
        <h1 className="mt-2 font-display text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl">
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
          {CONTACT_METHODS.map(({ icon: Icon, tile, ink, label, value, href }) => (
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
                  <a
                    href={href}
                    className="mt-0.5 block truncate text-[15px] font-semibold hover:text-accent-strong"
                  >
                    {value}
                  </a>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      {/* ---------- Consultation form ---------- */}
      <section aria-label="Request a consultation" className="mt-6 pb-12 sm:pb-16">
        <ConsultationForm />
      </section>
    </Container>
  );
}
