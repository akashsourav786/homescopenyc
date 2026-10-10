"use client";

import { cn } from "@/lib/utils";

/**
 * Small form primitives for the calculator, styled in the HomeScope
 * warm-minimal language. All inputs are controlled; parents own the state.
 */

export function FieldShell({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={htmlFor}
        className="text-[13px] font-semibold text-foreground"
      >
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-pastel-peach-ink">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

const inputClass =
  "h-11 w-full rounded-xl border border-border bg-card px-3.5 text-[15px] text-foreground " +
  "placeholder:text-muted/60 focus:outline-2 focus:outline-offset-1 focus:outline-ring " +
  "transition-shadow";

export function NumberField({
  id,
  label,
  value,
  onChange,
  prefix,
  suffix,
  hint,
  error,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  prefix?: string;
  suffix?: string;
  hint?: string;
  error?: string;
  placeholder?: string;
}) {
  return (
    <FieldShell label={label} hint={hint} error={error} htmlFor={id}>
      <div className="relative">
        {prefix && (
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[15px] text-muted">
            {prefix}
          </span>
        )}
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          className={cn(inputClass, prefix && "pl-7", suffix && "pr-10")}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={Boolean(error)}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[15px] text-muted">
            {suffix}
          </span>
        )}
      </div>
    </FieldShell>
  );
}

export function SelectField<T extends string>({
  id,
  label,
  value,
  onChange,
  options,
  hint,
}: {
  id: string;
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  hint?: string;
}) {
  return (
    <FieldShell label={label} hint={hint} htmlFor={id}>
      <select
        id={id}
        className={cn(inputClass, "appearance-none pr-9")}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold text-foreground">{label}</span>
      <div
        role="radiogroup"
        aria-label={label}
        className={cn(
          "grid gap-1 rounded-xl border border-border bg-background p-1",
          options.length > 2 ? "grid-cols-3" : "grid-cols-2",
        )}
      >
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(o.value)}
              className={cn(
                "h-9 rounded-lg text-sm font-semibold transition-colors",
                active
                  ? "bg-card text-foreground shadow-sm border border-border"
                  : "text-muted hover:text-foreground",
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
