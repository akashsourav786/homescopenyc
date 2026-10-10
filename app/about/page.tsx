import type { Metadata } from "next";
import { Code2, HandHeart, Scale } from "lucide-react";
import { Container } from "@/components/container";
import { Card } from "@/components/ui/card";
import { CreatorPhoto } from "@/components/creator-photo";

export const metadata: Metadata = { title: "About Akash" };

/** Why HomeScope NYC exists — the three purposes, in Akash's voice. */
const PURPOSES = [
  {
    icon: HandHeart,
    tile: "bg-pastel-mint",
    ink: "text-pastel-mint-ink",
    title: "Genuinely useful tools",
    body: "Free calculators and property insights that are accurate, easy to understand, and actually help — not bait to harvest your contact info.",
  },
  {
    icon: Code2,
    tile: "bg-pastel-blue",
    ink: "text-pastel-blue-ink",
    title: "Expertise, demonstrated",
    body: "I built this myself. It's proof I understand both real estate and technology — not just something I claim on a business card.",
  },
  {
    icon: Scale,
    tile: "bg-pastel-lavender",
    ink: "text-pastel-lavender-ink",
    title: "Leads with permission",
    body: "If a tool helps you, you can reach out on your terms. No pressure, no spam — just a conversation when you're ready.",
  },
];

/** Labeled placeholders — real values arrive after broker review. */
const BROKERAGE_FACTS = [
  { label: "Office address", value: "To be provided" },
  { label: "Office phone", value: "To be provided" },
  { label: "NYS real estate license #", value: "To be provided" },
];

export default function AboutPage() {
  return (
    <Container className="max-w-2xl">
      {/* ---------- Page header ---------- */}
      <section className="pt-8 sm:pt-12">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
          The creator behind HomeScope NYC
        </p>
        <h1 className="mt-2 text-[32px] font-extrabold leading-[1.15] tracking-tight sm:text-4xl">
          About Akash
        </h1>
      </section>

      {/* ---------- Creator profile ---------- */}
      <section aria-label="Creator profile" className="mt-6">
        <Card className="flex items-center gap-5 p-6">
          <CreatorPhoto />
          <div className="min-w-0">
            <p className="text-xl font-extrabold tracking-tight">
              Akash Rahman
            </p>
            <p className="mt-1 text-[14px] font-medium">
              NY Licensed Real Estate Salesperson
            </p>
            <p className="mt-0.5 text-[13px] text-muted">EXIT Realty DKC</p>
          </div>
        </Card>
      </section>

      {/* ---------- Bio ---------- */}
      <section aria-label="Biography" className="mt-6">
        <Card className="space-y-4 p-6">
          <h2 className="text-lg font-bold tracking-tight">The agent</h2>
          <p className="text-[15px] leading-relaxed text-muted">
            I&apos;m a New York licensed real estate salesperson with EXIT
            Realty DKC. I help buyers and sellers across New York City make
            confident, well-informed decisions — from first-time buyers
            figuring out what they can afford to homeowners deciding when
            it&apos;s the right time to sell.
          </p>
          <h2 className="pt-2 text-lg font-bold tracking-tight">
            The technologist
          </h2>
          <p className="text-[15px] leading-relaxed text-muted">
            My background is in Computer Science, and I&apos;m currently
            studying Data Science. I like building things — and I believe the
            best real estate guidance pairs human judgment with clear, honest
            numbers.
          </p>
        </Card>
      </section>

      {/* ---------- Why I built it ---------- */}
      <section aria-label="Why I built HomeScope NYC" className="mt-6">
        <h2 className="text-lg font-bold tracking-tight">
          Why I built HomeScope NYC
        </h2>
        <ul className="mt-4 grid gap-3">
          {PURPOSES.map(({ icon: Icon, tile, ink, title, body }) => (
            <li key={title}>
              <Card className="flex gap-4 p-5">
                <span
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tile} ${ink}`}
                >
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-[15px] font-bold tracking-tight">
                    {title}
                  </p>
                  <p className="mt-1 text-[14px] leading-relaxed text-muted">
                    {body}
                  </p>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      {/* ---------- Brokerage ---------- */}
      <section aria-label="Brokerage information" className="mt-6 pb-12 sm:pb-16">
        <Card className="p-6">
          <h2 className="text-lg font-bold tracking-tight">Brokerage</h2>
          <p className="mt-1 text-[15px] font-semibold">EXIT Realty DKC</p>
          <dl className="mt-4 space-y-3">
            {BROKERAGE_FACTS.map(({ label, value }) => (
              <div
                key={label}
                className="flex items-baseline justify-between gap-4 border-b border-border pb-3 last:border-0 last:pb-0"
              >
                <dt className="text-[13px] text-muted">{label}</dt>
                <dd className="text-right text-[14px] font-medium">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-5 text-xs leading-relaxed text-muted">
            Equal Housing Opportunity. Full brokerage disclosures and
            compliance review arrive before production launch.
          </p>
        </Card>
      </section>
    </Container>
  );
}
