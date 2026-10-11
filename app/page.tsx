import Link from "next/link";
import { Container } from "@/components/container";
import { Button } from "@/components/ui/button";
import { TOOLS } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { ExitLogo } from "@/components/brand/exit-logo";

/**
 * Homepage — "Big Type" (Direction D): giant Inter Tight headline with a
 * teal accent word, minimal numbered tool index, dark builder strip.
 */
export default function HomePage() {
  return (
    <>
      <Container>
        {/* ---------- Hero ---------- */}
        <section className="pb-14 pt-14 sm:pb-20 sm:pt-24">
          <p className="text-[12px] font-bold uppercase tracking-[0.24em] text-accent-strong">
            Free tools — no signup
          </p>
          <h1 className="mt-6 font-display text-[56px] font-extrabold leading-[0.98] tracking-[-0.035em] sm:text-[96px] lg:text-[120px]">
            Know what
            <br />
            you can <span className="text-accent">afford.</span>
          </h1>
          <p className="mt-7 max-w-xl text-[16px] leading-relaxed text-muted sm:text-lg">
            Six precise calculators for NYC buyers and sellers. Real
            underwriting math, public records, zero fluff.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button
              asChild
              size="lg"
              className="rounded-full px-8 text-[15px]"
            >
              <Link href="/buying-power">Calculate buying power →</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="rounded-full px-8 text-[15px]"
            >
              <Link href="#tools">All tools</Link>
            </Button>
          </div>
        </section>

        {/* ---------- Tool index ---------- */}
        <section id="tools" aria-label="Tools" className="scroll-mt-20 pb-16 sm:pb-24">
          <div className="flex items-baseline justify-between border-b-2 border-foreground pb-4">
            <h2 className="font-display text-[26px] font-extrabold tracking-tight sm:text-3xl">
              Tools
            </h2>
            <p className="text-[13px] text-muted">06 — free forever</p>
          </div>
          <ul className="grid sm:grid-cols-2">
            {TOOLS.map((tool, i) => (
              <li
                key={tool.href}
                className={cn(i % 2 === 0 ? "sm:border-r sm:pr-8" : "sm:pl-8")}
              >
                <Link
                  href={tool.href}
                  className="group flex items-center gap-5 border-b border-border py-6 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:py-7"
                >
                  <span className="font-display text-[14px] font-bold text-accent">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display text-[20px] font-bold tracking-tight sm:text-[22px]">
                      {tool.title}
                    </span>
                    <span className="mt-1 block truncate text-[13.5px] text-muted">
                      {tool.tagline}
                    </span>
                  </span>
                  <span
                    className="shrink-0 text-xl text-accent transition-transform group-hover:translate-x-1"
                    aria-hidden
                  >
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </Container>

      {/* ---------- Builder strip ---------- */}
      <Container className="pb-16 sm:pb-24">
        <section
          aria-label="About the creator"
          className="flex flex-col gap-8 bg-foreground px-7 py-10 text-background sm:flex-row sm:items-center sm:px-12 sm:py-14 dark:bg-card dark:text-foreground"
        >
          <ExitLogo variant="white" className="h-12 w-auto" />
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-[26px] font-extrabold tracking-tight sm:text-[32px]">
              Built by Akash Rahman
            </h2>
            <p className="mt-2 max-w-xl text-[14.5px] leading-relaxed opacity-70">
              NY Licensed Real Estate Salesperson, EXIT Realty DKC. Every
              number shows its work.
            </p>
          </div>
          <Button
            asChild
            size="lg"
            className="shrink-0 rounded-full bg-accent px-8 text-background hover:opacity-90 dark:text-accent-foreground"
          >
            <Link href="/contact">Talk to Akash →</Link>
          </Button>
        </section>
      </Container>
    </>
  );
}
