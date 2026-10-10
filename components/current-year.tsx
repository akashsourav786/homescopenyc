"use client";

import { useEffect, useState } from "react";

/** Year shown during prerender; corrected on the client after mount. */
const FALLBACK_YEAR = 2026;

/**
 * Renders the current year. The date is read inside `useEffect` so the
 * server prerender stays deterministic (required by Next 16's
 * Cache Components); the initial render matches on server and client,
 * so there is no hydration mismatch.
 */
export function CurrentYear() {
  const [year, setYear] = useState(FALLBACK_YEAR);

  // NOTE: setState-in-effect is intentional — the date read must happen on
  // the client after mount so the server prerender stays deterministic
  // (Next 16 flags `new Date()` during prerendering).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setYear(new Date().getFullYear());
  }, []);

  return <>{year}</>;
}
