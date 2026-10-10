"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type Theme } from "./theme-provider";
import { cn } from "@/lib/utils";

const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

/**
 * Light / Dark / System appearance switcher.
 * A small dropdown anchored to a button; closes on outside click or Escape.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
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

  const ActiveIcon =
    OPTIONS.find((o) => o.value === theme)?.icon ?? Monitor;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Change appearance"
        title="Change appearance"
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-xl border border-border",
          "bg-card text-foreground transition-colors",
          "hover:bg-accent-soft",
        )}
      >
        <ActiveIcon className="h-[18px] w-[18px]" aria-hidden />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Appearance"
          className={cn(
            "absolute right-0 z-50 mt-2 w-40 overflow-hidden rounded-xl border border-border",
            "bg-card shadow-lg shadow-black/5",
          )}
        >
          {OPTIONS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              role="menuitemradio"
              aria-checked={theme === value}
              onClick={() => {
                setTheme(value);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2.5 px-3.5 py-2.5 text-sm transition-colors",
                "hover:bg-accent-soft",
                theme === value
                  ? "font-semibold text-foreground"
                  : "text-muted",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
              <span className="flex-1 text-left">{label}</span>
              {theme === value && (
                <Check className="h-4 w-4 text-accent" aria-hidden />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
