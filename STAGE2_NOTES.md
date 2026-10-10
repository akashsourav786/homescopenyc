# HomeScope NYC — Stage 2 Notes
## Homepage and Creator Branding

**Status:** ✅ Complete — `npm run build` and `npm run lint` both pass.
**Date:** 2026-10-10

---

## 1. What was built (and why)

Stage 2 turns the creator-branding placeholders into real pages, on top of
the redesigned Stage 1 design system. No calculators, no auth, no backend —
those stay in their scheduled stages.

- **About page (`app/about/page.tsx`)** — the real page: creator profile
  card (name, title, brokerage), a first-person bio ("The agent" + "The
  technologist"), a "Why I built HomeScope NYC" section covering the three
  purposes (useful free tools / demonstrated expertise / permission-based
  leads), and a brokerage block with clearly-labeled placeholders (office
  address, phone, license #, all "To be provided") plus an Equal Housing
  Opportunity placeholder line. Full compliance review is Stage 13.
- **Contact page (`app/contact/page.tsx`)** — the real page: contact-method
  cards (call/text, email, brokerage office) with labeled "To be provided"
  placeholders — no invented phone numbers or emails — plus a note that an
  online consultation request form is coming later (Stage 9 owns lead
  capture, so no fake form collecting data with nowhere to go).
- **`components/creator-photo.tsx`** — new swappable portrait slot. Today it
  renders the AR monogram; a TODO comment marks the exact swap point for
  Akash's professional headshot. Used by the homepage and About page, so one
  edit updates everywhere.
- **Homepage polish (`app/page.tsx`)** — the "Built by Akash Rahman" card is
  now a full-card link to `/about`, and a new contact CTA card ("Questions
  about buying or selling in NYC?") links to `/contact`. Copy tightened;
  hero and tool rows unchanged from the approved redesign.

### Teaching notes (for Akash)

- **Why a separate `CreatorPhoto` component:** one swap point. When the
  headshot arrives, you change one file — not every page that shows the
  creator. This is the same instinct as shadcn's `cn()` utility: centralize
  what will change.
- **Why no contact form yet:** a form implies a backend that stores and
  notifies. Building the UI without the storage would either silently drop
  messages or fake success — both are worse than an honest "coming soon."
  Stage 9 builds the form together with its storage, consent records, and
  admin dashboard.
- **Server components by default:** the new pages are plain React Server
  Components (no `"use client"`). They render once on the server into static
  HTML — faster, no JavaScript shipped for content that never changes.
  `"use client"` is only needed when a component uses state, effects, or
  browser APIs (like the theme toggle and mobile menu already do).
- **`role="img"` on the monogram:** a `<span>` with initials isn't
  automatically announced usefully by screen readers; `role="img"` plus an
  `aria-label` makes it behave like an image with alt text.

---

## 2. Files created / changed

**Created:**
- `components/creator-photo.tsx` — swappable portrait (AR monogram + TODO)
- `STAGE2_NOTES.md` — this file

**Rewritten (placeholder → real):**
- `app/about/page.tsx` — creator profile, bio, 3 purposes, brokerage block
- `app/contact/page.tsx` — contact method cards, consultation-form note

**Modified:**
- `app/page.tsx` — Built-by card links to `/about`; new contact CTA card
  links to `/contact`; now imports `CreatorPhoto`

**Unchanged:** theme system, `globals.css` tokens, header/footer, all 6
tool placeholder routes, `placeholder-page.tsx`.

---

## 3. Dependencies added

None.

## 4. How to run locally

```bash
cd ~/workspace/homescope-nyc
npm install   # first time only
npm run dev   # → http://localhost:3000
```

## 5. Automated verification (actually executed)

- `npm run build` — ✅ passed. 9 app routes + `_not-found` prerendered as
  static (`/`, `/about`, `/contact`, `/buying-power`, `/monthly-cost`,
  `/property-insights`, `/home-worth`, `/seller-proceeds`,
  `/saved-reports`). TypeScript clean.
- `npm run lint` — ✅ passed, 0 errors, 0 warnings.

## 6. Manual test checklist

- [ ] Homepage: "Built by Akash Rahman" card → taps through to `/about`
- [ ] Homepage: contact CTA card → "Contact Akash" button goes to `/contact`
- [ ] `/about`: profile card, bio sections, 3 purpose cards, brokerage block
      with "To be provided" placeholders all render; no broken layout at
      360px wide
- [ ] `/contact`: 3 contact cards show "To be provided" (no fake numbers);
      consultation note reads naturally
- [ ] Header mobile menu: About Akash + Contact Akash reachable, active page
      highlighted, 44px+ touch targets
- [ ] Theme toggle still works on both new pages; reload on Dark → no flash
- [ ] Other 6 tool routes still show honest "Coming in Stage N" placeholders

## 7. Next stage preview

**Stage 3 — Buyer Qualification Calculator:** the first real financial tool —
a standalone, testable calculation engine for estimating buying power, with
input validation, transparent assumptions, and conservative/aggressive
scenarios. Awaiting your approval to proceed.
