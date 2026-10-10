"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Home, Menu, X } from "lucide-react";
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
          "flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-[13px] transition-colors",
          focusRing,
          open || isToolActive
            ? "bg-accent-soft font-semibold text-foreground"
            : "font-medium text-muted hover:bg-accent-soft hover:text-foreground",
        )}
      >
        {(open || isToolActive) && (
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
            aria-hidden
          />
        )}
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
        <div className="absolute right-0 top-full z-50 mt-2 w-[320px] rounded-2xl border border-border bg-card p-1.5 shadow-xl shadow-black/5">
          <ul>
            {TOOLS.map((tool) => {
              const active = toolPath(tool.href) === pathname;
              const Icon = tool.icon;
              return (
                <li key={tool.href}>
                  <Link
                    href={tool.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors",
                      focusRing,
                      active ? "bg-accent-soft" : "hover:bg-accent-soft",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                        tool.tile,
                        tool.ink,
                      )}
                    >
                      <Icon className="h-[18px] w-[18px]" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span
                        className={cn(
                          "block truncate text-[13.5px] text-foreground",
                          active ? "font-semibold" : "font-medium",
                        )}
                      >
                        {tool.title}
                      </span>
                      <span className="block truncate text-xs text-muted">
                        {tool.tagline}
                      </span>
                    </span>
                    {active && (
                      <span
                        className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                        aria-hidden
                      />
                    )}
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

          {/* Right side: tools dropdown, About, Contact (desktop) */}
          <nav
            aria-label="Primary"
            className="hidden shrink-0 items-center gap-1 xl:flex"
          >
            <PropertyToolsDropdown pathname={pathname} />
            <Link
              href={ABOUT_HREF}
              aria-current={aboutActive ? "page" : undefined}
              className={cn(
                "flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-[13px] transition-colors",
                focusRing,
                aboutActive
                  ? "bg-accent-soft font-semibold text-foreground"
                  : "font-medium text-muted hover:bg-accent-soft hover:text-foreground",
              )}
            >
              {aboutActive && (
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                  aria-hidden
                />
              )}
              About
            </Link>
            <span className="pl-1">
              <Button asChild size="sm" className="whitespace-nowrap">
                <Link
                  href={CONTACT_HREF}
                  aria-current={
                    pathname === CONTACT_HREF ? "page" : undefined
                  }
                >
                  Contact Akash
                </Link>
              </Button>
            </span>
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
              <ul className="mt-1 flex flex-col gap-1">
                {TOOLS.map((tool) => {
                  const active = toolPath(tool.href) === pathname;
                  const Icon = tool.icon;
                  return (
                    <li key={tool.href}>
                      <Link
                        href={tool.href}
                        onClick={closeMenu}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex min-h-[48px] items-center gap-3 rounded-xl px-4 py-2.5 transition-colors",
                          focusRing,
                          active
                            ? "bg-accent-soft font-semibold text-foreground"
                            : "font-medium text-muted hover:bg-accent-soft hover:text-foreground",
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                            tool.tile,
                            tool.ink,
                          )}
                        >
                          <Icon
                            className="h-4 w-4"
                            aria-hidden
                          />
                        </span>
                        <span className="flex-1 text-[14px]">{tool.title}</span>
                        {active && (
                          <span
                            className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                            aria-hidden
                          />
                        )}
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
