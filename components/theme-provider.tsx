"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "homescope-theme";

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Inline script that runs *before first paint*. It reads the persisted
 * theme (or the OS preference for "system") and sets the `.dark` class on
 * <html> immediately, so there is no light→dark flash on load.
 */
const THEME_SCRIPT = `(function(){try{var s=localStorage.getItem("${STORAGE_KEY}")||"system";var d=s==="dark"||(s==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.classList.toggle("dark",d);r.style.colorScheme=d?"dark":"light";}catch(e){}})();`;

function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme !== "system") return theme;
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(resolved: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("light");
  const themeRef = useRef<Theme>("system");

  // Read the persisted preference on mount and apply it.
  // NOTE: setState-in-effect is intentional here — this is the canonical
  // "sync React state with an external system (localStorage)" case. Reading
  // localStorage during render/initializer would cause a server/client
  // hydration mismatch, since the server cannot know the stored value.
  useEffect(() => {
    const stored =
      (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? "system";
    themeRef.current = stored;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setThemeState(stored);
    const resolved = resolveTheme(stored);
    setResolvedTheme(resolved);
    applyTheme(resolved);

    // When in "system" mode, follow OS theme changes live.
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (themeRef.current === "system") {
        const next = media.matches ? "dark" : "light";
        setResolvedTheme(next);
        applyTheme(next);
      }
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    themeRef.current = next;
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage unavailable — theme still applies for this session */
    }
    const resolved = resolveTheme(next);
    setResolvedTheme(resolved);
    applyTheme(resolved);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {/* Runs before paint on initial load to prevent a theme flash. */}
      <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within <ThemeProvider>");
  return ctx;
}
