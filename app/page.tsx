import Link from "next/link";
import { ArrowRight, MessageCircle } from "lucide-react";
import { Container } from "@/components/container";
import { Card } from "@/components/ui/card";
import { CreatorPhoto } from "@/components/creator-photo";
import { ToolRow } from "@/components/tool-row";
import { TOOLS } from "@/lib/nav";

/**
 * Homepage — mirrors the approved reference home screen:
 * bold headline, short subtext, stacked tool rows, a "Built by" card
 * (links to /about), and a contact call-to-action (links to /contact).
 *
 * Still Stage 1 scope: every tool links to its labeled placeholder route.
 */
export default function HomePage() {
  return (
    <Container className="max-w-2xl">
      {/* ---------- Hero ---------- */}
      <section className="pt-8 sm:pt-12">
        <h1 className="text-[32px] font-extrabold leading-[1.15] tracking-tight sm:text-4xl">
          Smarter tools
          <br />
          for your next move.
        </h1>
        <p className="mt-3 max-w-md text-[15px] leading-relaxed text-muted">
          Free, easy-to-use tools to help New Yorkers buy, sell, and research
          with confidence.
        </p>
      </section>

      {/* ---------- Tool rows ---------- */}
      <section aria-label="Tools" className="mt-6">
        <ul className="grid gap-3 sm:grid-cols-2">
          {TOOLS.map((tool) => (
            <li key={tool.title}>
              <ToolRow tool={tool} />
            </li>
          ))}
        </ul>
      </section>

      {/* ---------- Built by → /about ---------- */}
      <section aria-label="About the creator" className="mt-6">
        <Link
          href="/about"
          className="group block rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <Card className="flex items-center gap-4 p-5 transition-colors group-hover:bg-accent-soft/40">
            <CreatorPhoto className="h-14 w-14 text-lg" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                Built by
              </p>
              <p className="mt-0.5 text-[15px] font-bold tracking-tight">
                Akash Rahman
              </p>
              <p className="mt-0.5 text-[13px] leading-snug text-muted">
                NY Licensed Real Estate Salesperson · EXIT Realty DKC
              </p>
            </div>
            <ArrowRight
              className="h-5 w-5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5"
              aria-hidden
            />
          </Card>
        </Link>
      </section>

      {/* ---------- Contact CTA → /contact ---------- */}
      <section aria-label="Contact" className="mt-3 pb-12 sm:pb-16">
        <Card className="flex items-center gap-4 bg-accent-soft p-5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <MessageCircle className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold tracking-tight">
              Questions about buying or selling in NYC?
            </p>
            <p className="mt-0.5 text-[13px] leading-snug text-muted">
              Talk it through with the agent who built this.
            </p>
          </div>
          <Link
            href="/contact"
            className="shrink-0 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90"
          >
            Contact Akash
          </Link>
        </Card>
      </section>
    </Container>
  );
}
