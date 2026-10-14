"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Container } from "@/components/container";
import { Button } from "@/components/ui/button";

/**
 * Site-wide "Talk to Akash" builder strip, rendered at the bottom of every
 * page (via the root layout) except /contact itself — the CTA's
 * destination, where it would be redundant.
 */
export function SiteCta() {
  const pathname = usePathname();
  if (pathname === "/contact") return null;
  return (
    <Container className="pb-16 sm:pb-24">
      <section
        aria-label="About the creator"
        className="flex flex-col gap-8 bg-foreground px-7 py-10 text-background sm:flex-row sm:items-center sm:px-12 sm:py-14 dark:bg-card dark:text-foreground"
      >
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[26px] font-extrabold tracking-tight sm:text-[32px]">
            Built by Akash Rahman Sourav
          </h2>
          <p className="mt-2 max-w-xl text-[14.5px] leading-relaxed opacity-70">
            NY Licensed Real Estate Salesperson, EXIT Realty DKC. Every number
            shows its work.
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
  );
}
