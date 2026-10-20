import Link from "next/link";
import { NAV_ITEMS } from "@/lib/nav";
import { Container } from "./container";
import { CurrentYear } from "./current-year";

/**
 * Site footer — Direction D minimal: hairline top, brand row, quiet
 * legal line. Brokerage disclosure is text-only (no logos) per NY
 * advertising rules — name, address, and phone.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <Container className="py-10">
        {/* Brand + nav */}
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <Link
              href="/"
              className="inline-flex items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              aria-label="akash sells nyc home"
            >
              <span className="font-display text-[17px] font-extrabold tracking-tight">
                akash <span className="text-accent">sells nyc</span>
              </span>
            </Link>
            <p className="mt-4 text-sm leading-relaxed text-muted">
              Property Lab — a free NYC real estate toolkit, created by{" "}
              <span className="font-semibold text-foreground">
                Akash Rahman Sourav
              </span>
              , NY Licensed Real Estate Salesperson, EXIT Realty DKC.
            </p>
          </div>

          <nav aria-label="Footer">
            <ul className="grid grid-cols-2 gap-x-10 gap-y-2.5">
              {NAV_ITEMS.map(({ label, href }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="rounded text-sm text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        {/* Legal */}
        <div className="mt-10 border-t border-border pt-6">
          <p className="text-xs leading-relaxed text-muted">
            Akash Rahman Sourav, NY Licensed Real Estate Salesperson · EXIT
            Realty DKC, 3825 E Tremont Ave, Bronx, NY 10465 · 631-833-3320
          </p>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            All calculators provide estimates for educational purposes only
            and are not mortgage approvals, appraisals, or financial advice.
            [Privacy Policy · Terms of Use — placeholders]
          </p>
          <p className="mt-4 text-xs text-muted">
            © <CurrentYear /> akash sells nyc · Created by Akash Rahman
            Sourav, NY Licensed Real Estate Salesperson, EXIT Realty DKC.
            Equal Housing Opportunity. · Not a listing service.
          </p>
        </div>
      </Container>
    </footer>
  );
}
