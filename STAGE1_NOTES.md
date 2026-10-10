# HomeScope NYC — Stage 1 Notes
## Project Setup and Design System

**Status:** ✅ Complete — `npm run build` and `npm run lint` both pass.
**Date:** 2026-10-10

---

## 1. What was built (and why)

A working, responsive homepage shell for HomeScope NYC with a functional
Light / Dark / System theme toggle. This stage establishes the foundation
every later stage builds on:

- **Design tokens** — the full HomeScope pastel palette for light and dark
  modes, wired as CSS variables so the whole UI re-themes instantly.
- **Theme system** — custom `ThemeProvider` (no extra dependency) that
  persists the choice to `localStorage`, follows the OS in "System" mode,
  and runs an inline script *before first paint* so there is no theme flash.
- **Reusable components** — shadcn/ui-style `Button` and `Card`, plus
  `Container`, `SiteHeader`, `SiteFooter`, `ToolCard`, `ThemeToggle`, and a
  shared `PlaceholderPage` for routes whose real UIs arrive in later stages.
- **Navigation** — sticky header with desktop nav (xl+) and a mobile menu;
  all 9 planned routes exist. Eight are honest labeled placeholders
  ("Coming in Stage N") — no fake functionality.
- **Homepage shell** — hero with "HomeScope NYC — Created by Akash Rahman"
  branding, tool card grid, About/Contact teaser sections, and a footer with
  creator attribution, brokerage placeholders, and disclaimer placeholders.

### Teaching notes (for Akash)

- **Tailwind v4 theming:** there is no `tailwind.config.js`. Colors are CSS
  variables on `:root` / `.dark`, mapped to utilities via `@theme inline`
  in `app/globals.css`. `inline` means utilities reference the *variable*,
  so toggling `.dark` on `<html>` re-themes everything at runtime.
- **`@custom-variant dark`:** makes `dark:` utilities respond to the
  `.dark` class instead of the OS media query (we control the class).
- **No-flash script:** `components/theme-provider.tsx` renders an inline
  `<script>` as the first element in `<body>` that reads `localStorage`
  and sets `.dark` before the browser paints.
- **`suppressHydrationWarning` on `<html>`:** the server can't know the
  stored theme, so the `class` attribute may legitimately differ after
  hydration — this silences that expected warning.
- **Next 16 "Cache Components" gotcha:** `new Date()` during prerender is
  a build error, even inside client components. The footer year lives in
  `components/current-year.tsx`, which reads the date in `useEffect`.

---

## 2. Files created / changed

**Created:**
- `app/globals.css` — design tokens, Tailwind v4 `@theme inline` mapping,
  class-based dark variant, base styles, focus rings
- `app/page.tsx` — homepage (hero, tool grid, about/contact teasers)
- `app/layout.tsx` — root layout: Inter font, metadata, ThemeProvider,
  header/footer (replaced scaffold defaults)
- `app/buying-power/page.tsx`, `app/monthly-cost/page.tsx`,
  `app/property-insights/page.tsx`, `app/home-worth/page.tsx`,
  `app/seller-proceeds/page.tsx`, `app/saved-reports/page.tsx`,
  `app/about/page.tsx`, `app/contact/page.tsx` — placeholder routes
- `lib/utils.ts` — `cn()` (clsx + tailwind-merge), shadcn/ui standard
- `lib/nav.ts` — `NAV_ITEMS` (9 routes) and `TOOLS` (6 homepage cards)
- `components/theme-provider.tsx` — theme context + no-flash inline script
- `components/theme-toggle.tsx` — Light/Dark/System dropdown
- `components/current-year.tsx` — client-rendered footer year
- `components/ui/button.tsx` — shadcn-style Button (cva variants + asChild)
- `components/ui/card.tsx` — shadcn-style Card primitives
- `components/container.tsx` — centered max-width container
- `components/site-header.tsx` — sticky header, desktop + mobile nav
- `components/site-footer.tsx` — attribution, brokerage/disclaimer placeholders
- `components/tool-card.tsx` — homepage tool navigation card
- `components/placeholder-page.tsx` — shared "coming in Stage N" page

**Changed:** `package.json` / `package-lock.json` (new dependencies only).

---

## 3. Dependencies added

| Package | Why |
|---|---|
| `lucide-react` | Line icons throughout (nav, tool cards, toggles) |
| `clsx`, `tailwind-merge` | `cn()` class merging utility (shadcn/ui standard) |
| `class-variance-authority` | `Button` variant system (shadcn/ui standard) |
| `@radix-ui/react-slot` | `asChild` support so `Button` can render a Next.js `Link` |

**Environment variables:** none needed for Stage 1.

---

## 4. How to run locally

Prerequisites: **Node.js 18.18+** (tested on Node 24) and npm.

```bash
cd ~/workspace/homescope-nyc   # or wherever you cloned this folder

# First time only — install dependencies
npm install

# Start the dev server
npm run dev
# → open http://localhost:3000

# Production check (what was verified here)
npm run build
npm run lint
```

To see the production build locally: `npm run build && npm run start`.

---

## 5. Automated verification (actually executed)

- `npm run build` — ✅ passed. All 9 routes prerendered as static pages
  (`/`, `/buying-power`, `/monthly-cost`, `/property-insights`,
  `/home-worth`, `/seller-proceeds`, `/saved-reports`, `/about`, `/contact`).
- `npm run lint` — ✅ passed, 0 errors, 0 warnings.

**Errors encountered and fixed:**
1. `new Date()` in `SiteFooter` broke the Next 16 prerender ("Cache
   Components" flags non-deterministic values). Fixed by moving the year
   into `components/current-year.tsx`, a client component that reads the
   date in `useEffect` with a deterministic prerender fallback.
2. ESLint `react-hooks/set-state-in-effect` on the theme mount-sync.
   Kept the pattern (it's the correct way to sync `localStorage` without
   a hydration mismatch) and documented it with a targeted disable comment.

---

## 6. Manual test checklist

- [ ] `npm run dev`, open http://localhost:3000 — homepage renders, no errors
- [ ] Hero shows "HomeScope NYC" + "Created by Akash Rahman, NY Licensed
      Real Estate Salesperson · EXIT Realty DKC"
- [ ] Six tool cards render in a grid (1 col mobile → 2 col sm → 3 col lg)
- [ ] Every tool card links to its route; each route shows a "Coming in
      Stage N" card with a "Back to home" link
- [ ] Header nav: all 9 links work; active page is highlighted
- [ ] Mobile (< 1280px): hamburger opens/closes the full nav list
- [ ] Theme toggle (header): Light → whole UI goes light; Dark → dark;
      System → follows OS setting (test by changing OS appearance)
- [ ] Reload the page with Dark selected — theme persists, **no white flash**
- [ ] Footer shows creator attribution, brokerage placeholder, disclaimers
- [ ] Resize to 360px wide — no horizontal scroll, cards stack cleanly

---

## 7. Next stage preview

**Stage 2 — Homepage and Creator Branding:** flesh out the homepage hero,
build the real About Akash page (bio, photo, brokerage details) and the
Contact page, and polish mobile navigation — all on top of this stage's
design system. Awaiting your approval to proceed.
