import Link from "next/link";
import { ArrowRight, BadgeCheck, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { Container } from "@/components/container";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ToolCard } from "@/components/tool-card";
import { TOOLS } from "@/lib/nav";

/**
 * Stage 1 homepage shell: hero with creator branding, tool navigation
 * grid, placeholder About/Contact sections. Real tool UIs arrive in
 * later stages; every card links to a labeled placeholder route.
 */
export default function HomePage() {
  return (
    <>
      {/* ---------- Hero ---------- */}
      <section className="relative overflow-hidden">
        {/* Soft pastel backdrop */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-pastel-blue/70 via-background to-background"
        />
        <Container className="relative py-14 sm:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-1.5 text-[13px] font-semibold text-muted">
              <Sparkles className="h-4 w-4 text-accent" aria-hidden />
              Free NYC real estate toolkit
            </span>
            <h1 className="mt-5 text-4xl font-extrabold tracking-tight sm:text-5xl">
              HomeScope NYC
            </h1>
            <p className="mt-3 text-[15px] font-medium text-muted">
              Created by{" "}
              <span className="font-semibold text-foreground">Akash Rahman</span>
              , NY Licensed Real Estate Salesperson · EXIT Realty DKC
            </p>
            <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted">
              Understand what you can afford, what a home truly costs each
              month, and what your property is worth — with clear, honest
              numbers built for New York City.
            </p>
            <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="#tools">
                  Explore the tools
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/about">About Akash</Link>
              </Button>
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13px] text-muted">
              <span className="inline-flex items-center gap-1.5">
                <BadgeCheck className="h-4 w-4 text-accent" aria-hidden />
                Always free
              </span>
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-accent" aria-hidden />
                No account needed to start
              </span>
            </div>
          </div>
        </Container>
      </section>

      {/* ---------- Tool grid ---------- */}
      <section id="tools" className="scroll-mt-20">
        <Container className="py-10 sm:py-14">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Buyer &amp; seller tools
            </h2>
            <p className="mt-2 text-[15px] leading-relaxed text-muted">
              Each tool below is a placeholder in Stage 1 — the real
              calculators arrive in their scheduled stages.
            </p>
          </div>
          <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {TOOLS.map((tool) => (
              <ToolCard key={tool.title} tool={tool} />
            ))}
          </div>
        </Container>
      </section>

      {/* ---------- About teaser ---------- */}
      <section>
        <Container className="py-6 sm:py-10">
          <Card className="overflow-hidden">
            <div className="grid gap-6 p-6 sm:p-10 md:grid-cols-[auto_1fr] md:items-center">
              {/* Photo placeholder */}
              <div
                aria-hidden
                className="mx-auto flex h-28 w-28 items-center justify-center rounded-full bg-pastel-lavender text-2xl font-bold text-foreground sm:h-36 sm:w-36"
              >
                AR
              </div>
              <div className="text-center md:text-left">
                <p className="text-[13px] font-semibold uppercase tracking-wider text-accent">
                  About the creator
                </p>
                <h2 className="mt-1 text-2xl font-bold tracking-tight">
                  Akash Rahman
                </h2>
                <p className="mt-1 text-sm font-medium text-muted">
                  NY Licensed Real Estate Salesperson · EXIT Realty DKC ·
                  Computer Science &amp; Data Science background
                </p>
                <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted">
                  [Full bio placeholder — why Akash built HomeScope NYC and
                  how his technology background shapes his approach to real
                  estate.]
                </p>
                <div className="mt-5">
                  <Button asChild variant="secondary">
                    <Link href="/about">
                      More about Akash
                      <ArrowRight aria-hidden />
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </Container>
      </section>

      {/* ---------- Contact teaser ---------- */}
      <section>
        <Container className="py-6 pb-12 sm:py-10 sm:pb-16">
          <Card className="bg-accent-soft p-6 text-center sm:p-10">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-card">
              <Mail className="h-6 w-6 text-accent" aria-hidden />
            </span>
            <h2 className="mt-4 text-2xl font-bold tracking-tight">
              Questions about buying or selling in NYC?
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-[15px] leading-relaxed text-muted">
              [Contact details placeholder — phone, email, and consultation
              request form arrive in a later stage.]
            </p>
            <div className="mt-6">
              <Button asChild size="lg">
                <Link href="/contact">Contact Akash</Link>
              </Button>
            </div>
          </Card>
        </Container>
      </section>
    </>
  );
}
