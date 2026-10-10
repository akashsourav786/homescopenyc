import Link from "next/link";
import { Home } from "lucide-react";
import { NAV_ITEMS } from "@/lib/nav";
import { Container } from "./container";
import { CurrentYear } from "./current-year";

/**
 * Site footer: creator attribution, brokerage placeholder,
 * compliance/disclaimer placeholders, quick links.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-card">
      <Container className="py-10">
        <div className="grid gap-8 md:grid-cols-3">
          {/* Brand + creator */}
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                <Home className="h-5 w-5" aria-hidden />
              </span>
              <span className="text-[15px] font-bold tracking-tight">
                HomeScope NYC
              </span>
            </div>
            <p className="mt-3 text-sm text-muted">
              A free NYC real estate toolkit, created by{" "}
              <span className="font-semibold text-foreground">Akash Rahman</span>,
              NY Licensed Real Estate Salesperson, EXIT Realty DKC.
            </p>
          </div>

          {/* Quick links */}
          <nav aria-label="Footer">
            <p className="text-sm font-semibold">Explore</p>
            <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
              {NAV_ITEMS.map(({ label, href }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="text-sm text-muted transition-colors hover:text-foreground"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Brokerage / compliance placeholders */}
          <div>
            <p className="text-sm font-semibold">Brokerage</p>
            <p className="mt-3 text-sm text-muted">
              [Brokerage logo and required NY disclosures — placeholder]
            </p>
            <p className="mt-3 text-xs leading-relaxed text-muted">
              All calculators provide estimates for educational purposes only
              and are not mortgage approvals, appraisals, or financial advice.
              [Privacy Policy · Terms of Use — placeholders]
            </p>
          </div>
        </div>

        <div className="mt-10 border-t border-border pt-6">
          <p className="text-xs text-muted">
            © <CurrentYear /> HomeScope NYC · Created by Akash
            Rahman, NY Licensed Real Estate Salesperson, EXIT Realty DKC.
            Equal Housing Opportunity.
          </p>
        </div>
      </Container>
    </footer>
  );
}
