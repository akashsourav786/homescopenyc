import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ToolDef } from "@/lib/nav";

/**
 * Homepage tool row: pastel icon chip, title + one-line tagline,
 * chevron. The entire row is a link with a 44px+ touch target.
 */
export function ToolRow({ tool }: { tool: ToolDef }) {
  const Icon = tool.icon;
  return (
    <Link
      href={tool.href}
      className={cn(
        "group flex min-h-[76px] items-center gap-4 rounded-2xl border border-border",
        "bg-card p-4 shadow-sm transition-colors hover:bg-accent-soft/40",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
      )}
    >
      <span
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
          tool.tile,
          tool.ink,
        )}
      >
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold tracking-tight">
          {tool.title}
        </span>
        <span className="mt-0.5 block truncate text-[13px] text-muted">
          {tool.tagline}
        </span>
      </span>
      <ChevronRight
        className="h-5 w-5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5"
        aria-hidden
      />
    </Link>
  );
}
