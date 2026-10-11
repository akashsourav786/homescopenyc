"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Menu, X } from "lucide-react";
import { TOOLS } from "@/lib/nav";
import { ThemeToggle } from "./theme-toggle";
import { Container } from "./container";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";

const ABOUT_HREF = "/about";
const CONTACT_HREF = "/contact";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** Strip query strings so `/property-insights?mode=compare` matches the page. */
function toolPath(href: string) {
  return href.split("?")[0];
}

/**
 * Desktop "Property Tools" dropdown: all six tools in one rich menu with
 * icon chips and taglines. Opens on hover, toggles on click (keyboard /
 * touch), closes on Escape, outside tap, or navigation.
 */
function PropertyToolsDropdown({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isToolActive = TOOLS.some((t) => toolPath(t.href) === pathname);

  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open ]);

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  return (
    <div
      ref={wrapRef}
      className="relative"
      onMouseEnter={() => {
        cancelClose();
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1.5 whitespace-nowrap py-2 text-[14px] transition-colors",
          focusRing,
          open || isToolActive
            ? "font-semibold text-foreground"
            : "font-medium text-muted hover:text-foreground",
        )}
      >
        Property Tools
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 transition-transform duration-200",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[320px] border border-border bg-card py-1 shadow-xl shadow-black/5">
          <ul>
            {TOOLS.map((tool, i) => {
              const active = toolPath(tool.href) === pathname;
              return (
                <li key={tool.href}>
                  <Link
                    href={tool.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group flex items-center gap-4 px-5 py-3.5 transition-colors",
                      focusRing,
                      active ? "bg-accent-soft/60" : "hover:bg-accent-soft/60",
                    )}
                  >
                    <span className="font-display text-[13px] font-bold text-accent">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block truncate font-display text-[15px] tracking-tight text-foreground",
                          active ? "font-bold" : "font-semibold",
                        )}
                      >
                        {tool.title}
                      </span>
                      <span className="block truncate text-xs text-muted">
                        {tool.tagline}
                      </span>
                    </span>
                    <span
                      className="text-accent opacity-0 transition-opacity group-hover:opacity-100"
                      aria-hidden
                    >
                      →
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Slim sticky header: brand (home) on the left; Property Tools dropdown,
 * About, and Contact on the right. Mobile gets a hamburger with a
 * collapsible Property Tools section.
 */
export function SiteHeader() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);
  const aboutActive = pathname === ABOUT_HREF;

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-md">
      <Container>
        <div className="flex h-14 items-center justify-between gap-3">
          {/* Brand = home, left side */}
          <Link
            href="/"
            className={cn(
              "flex shrink-0 items-center gap-3 rounded-lg",
              focusRing,
            )}
            aria-label="HomeScope NYC home"
          >
            {/* HomeScope wordmark (text — no HomeScope logo exists yet) */}
            <span className="font-display text-[19px] font-extrabold tracking-tight">
              HomeScope <span className="text-accent">NYC</span>
            </span>
          </Link>

          {/* Right side: tools dropdown, About, Contact (desktop) */}
          <nav
            aria-label="Primary"
            className="hidden shrink-0 items-center gap-7 xl:flex"
          >
            <PropertyToolsDropdown pathname={pathname} />
            <Link
              href={ABOUT_HREF}
              aria-current={aboutActive ? "page" : undefined}
              className={cn(
                "whitespace-nowrap py-2 text-[14px] transition-colors",
                focusRing,
                aboutActive
                  ? "font-semibold text-foreground"
                  : "font-medium text-muted hover:text-foreground",
              )}
            >
              About
            </Link>
            <Button asChild className="whitespace-nowrap rounded-full">
              <Link
                href={CONTACT_HREF}
                aria-current={pathname === CONTACT_HREF ? "page" : undefined}
              >
                Contact Akash
              </Link>
            </Button>
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

      {/* Mobile nav panel */}
      {menuOpen && (
        <nav aria-label="Mobile" className="border-t border-border xl:hidden">
          <Container className="py-4">
            {/* Collapsible Property Tools section */}
            <button
              type="button"
              aria-expanded={toolsOpen}
              onClick={() => setToolsOpen((v) => !v)}
              className={cn(
                "flex min-h-[48px] w-full items-center gap-3 rounded-xl px-4 py-3 text-[15px] font-semibold text-foreground transition-colors",
                "hover:bg-accent-soft",
                focusRing,
              )}
            >
              <span className="flex-1 text-left">Property Tools</span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-muted transition-transform duration-200",
                  toolsOpen && "rotate-180",
                )}
                aria-hidden
              />
            </button>
            {toolsOpen && (
              <ul className="mt-1 flex flex-col">
                {TOOLS.map((tool, i) => {
                  const active = toolPath(tool.href) === pathname;
                  return (
                    <li key={tool.href}>
                      <Link
                        href={tool.href}
                        onClick={closeMenu}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex min-h-[52px] items-center gap-4 border-b border-border px-4 py-3 transition-colors",
                          focusRing,
                          active
                            ? "font-semibold text-foreground"
                            : "font-medium text-muted active:text-foreground",
                        )}
                      >
                        <span className="font-display text-[13px] font-bold text-accent">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className="flex-1 font-display text-[16px] font-semibold tracking-tight text-foreground">
                          {tool.title}
                        </span>
                        <span className="text-accent" aria-hidden>
                          →
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}

            <hr className="my-3 border-border" />

            <Link
              href={ABOUT_HREF}
              onClick={closeMenu}
              aria-current={aboutActive ? "page" : undefined}
              className={cn(
                "flex min-h-[48px] items-center rounded-xl px-4 py-3 text-[15px] transition-colors",
                focusRing,
                aboutActive
                  ? "bg-accent-soft font-semibold text-foreground"
                  : "font-medium text-muted hover:bg-accent-soft hover:text-foreground",
              )}
            >
              About Akash
            </Link>

            <Button asChild size="lg" className="mt-3 w-full">
              <Link
                href={CONTACT_HREF}
                onClick={closeMenu}
                aria-current={
                  pathname === CONTACT_HREF ? "page" : undefined
                }
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
