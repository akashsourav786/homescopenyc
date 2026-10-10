"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Menu, X } from "lucide-react";
import { NAV_ITEMS } from "@/lib/nav";
import { ThemeToggle } from "./theme-toggle";
import { Container } from "./container";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";

const CONTACT_HREF = "/contact";
const ABOUT_HREF = "/about";

/** Tool links for the grouped mobile menu (brand covers Home). */
const TOOL_ITEMS = NAV_ITEMS.filter(
  (item) =>
    item.href !== "/" &&
    item.href !== ABOUT_HREF &&
    item.href !== CONTACT_HREF,
);
/** Company links for the grouped mobile menu. */
const COMPANY_ITEMS = NAV_ITEMS.filter((item) => item.href === ABOUT_HREF);

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/**
 * Slim sticky header: brand mark, desktop nav (xl+), theme toggle,
 * and a grouped mobile menu. The Contact link renders as a compact
 * dark-teal button — the conversion path — on both desktop and mobile.
 */
export function SiteHeader() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-md">
      <Container>
        <div className="flex h-14 items-center justify-between gap-3">
          {/* Brand */}
          <Link
            href="/"
            className={cn(
              "flex shrink-0 items-center gap-2.5 rounded-lg",
              focusRing,
            )}
            aria-label="HomeScope NYC home"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-pastel-mint text-pastel-mint-ink">
              <Home className="h-[18px] w-[18px]" aria-hidden />
            </span>
            <span className="text-[15px] font-bold tracking-tight">
              HomeScope NYC
            </span>
          </Link>

          {/* Desktop nav */}
          <nav
            aria-label="Primary"
            className="hidden min-w-0 flex-1 items-center justify-center xl:flex"
          >
            <ul className="flex items-center gap-1.5 overflow-x-auto">
              {NAV_ITEMS.map(({ label, href }) => {
                const active = pathname === href;
                // Contact stands out as the conversion path.
                if (href === CONTACT_HREF) {
                  return (
                    <li key={href} className="pl-1">
                      <Button asChild size="sm" className="whitespace-nowrap">
                        <Link
                          href={href}
                          aria-current={active ? "page" : undefined}
                        >
                          {label}
                        </Link>
                      </Button>
                    </li>
                  );
                }
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-2 text-[13px] transition-colors",
                        focusRing,
                        active
                          ? "bg-accent-soft font-semibold text-foreground"
                          : "font-medium text-muted hover:bg-accent-soft hover:text-foreground",
                      )}
                    >
                      {active && (
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                          aria-hidden
                        />
                      )}
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Divider between nav and actions (desktop) */}
          <span
            className="hidden h-6 w-px shrink-0 bg-border xl:block"
            aria-hidden
          />

          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle />
            {/* Mobile menu button — 44px touch target */}
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              className={cn(
                "flex h-11 w-11 items-center justify-center rounded-xl text-foreground",
                "transition-colors hover:bg-accent-soft xl:hidden",
                focusRing,
              )}
            >
              {menuOpen ? (
                <X className="h-5 w-5" aria-hidden />
              ) : (
                <Menu className="h-5 w-5" aria-hidden />
              )}
            </button>
          </div>
        </div>
      </Container>

      {/* Mobile nav panel — grouped links + Contact CTA */}
      {menuOpen && (
        <nav aria-label="Mobile" className="border-t border-border xl:hidden">
          <Container className="py-4">
            <MobileSection label="Tools">
              {TOOL_ITEMS.map((item) => (
                <MobileRow
                  key={item.href}
                  label={item.label}
                  href={item.href}
                  icon={item.icon}
                  active={pathname === item.href}
                  onNavigate={closeMenu}
                />
              ))}
            </MobileSection>

            <hr className="my-3 border-border" />

            <MobileSection label="Company">
              {COMPANY_ITEMS.map((item) => (
                <MobileRow
                  key={item.href}
                  label={item.label}
                  href={item.href}
                  icon={item.icon}
                  active={pathname === item.href}
                  onNavigate={closeMenu}
                />
              ))}
            </MobileSection>

            <Button asChild size="lg" className="mt-4 w-full">
              <Link
                href={CONTACT_HREF}
                onClick={closeMenu}
                aria-current={pathname === CONTACT_HREF ? "page" : undefined}
              >
                Contact Akash
              </Link>
            </Button>
          </Container>
        </nav>
      )}
    </header>
  );
}

function MobileSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={label}>
      <p className="px-4 text-[11px] font-semibold uppercase tracking-widest text-muted">
        {label}
      </p>
      <ul className="mt-2 flex flex-col gap-1">{children}</ul>
    </section>
  );
}

function MobileRow({
  label,
  href,
  icon: Icon,
  active,
  onNavigate,
}: {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
  active: boolean;
  onNavigate: () => void;
}) {
  return (
    <li>
      <Link
        href={href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex min-h-[48px] items-center gap-3 rounded-xl px-4 py-3 text-[15px] transition-colors",
          focusRing,
          active
            ? "bg-accent-soft font-semibold text-foreground"
            : "font-medium text-muted hover:bg-accent-soft hover:text-foreground",
        )}
      >
        <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
        <span className="flex-1">{label}</span>
        {active && (
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
            aria-hidden
          />
        )}
      </Link>
    </li>
  );
}
