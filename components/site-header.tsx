"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Menu, X } from "lucide-react";
import { NAV_ITEMS } from "@/lib/nav";
import { ThemeToggle } from "./theme-toggle";
import { Container } from "./container";
import { cn } from "@/lib/utils";

/**
 * Slim sticky header: brand mark, ThemeToggle, and a mobile menu.
 * Desktop nav appears at xl and up; the reference home screen is
 * mobile-first, so the header stays compact.
 */
export function SiteHeader() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-md">
      <Container>
        <div className="flex h-14 items-center justify-between gap-3">
          {/* Brand */}
          <Link
            href="/"
            className="flex items-center gap-2.5 rounded-lg"
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
            <ul className="flex items-center gap-1 overflow-x-auto">
              {NAV_ITEMS.map(({ label, href }) => {
                const active = pathname === href;
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "whitespace-nowrap rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors",
                        active
                          ? "bg-accent-soft text-foreground"
                          : "text-muted hover:bg-accent-soft hover:text-foreground",
                      )}
                    >
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="flex items-center gap-2">
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

      {/* Mobile nav panel */}
      {menuOpen && (
        <nav aria-label="Mobile" className="border-t border-border xl:hidden">
          <Container className="py-3">
            <ul className="flex flex-col gap-1">
              {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
                const active = pathname === href;
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      onClick={() => setMenuOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex min-h-[48px] items-center gap-3 rounded-xl px-4 py-3 text-[15px] font-medium transition-colors",
                        active
                          ? "bg-accent-soft text-foreground"
                          : "text-muted hover:bg-accent-soft hover:text-foreground",
                      )}
                    >
                      <Icon
                        className="h-[18px] w-[18px] shrink-0"
                        aria-hidden
                      />
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Container>
        </nav>
      )}
    </header>
  );
}
