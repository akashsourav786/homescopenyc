import { cn } from "@/lib/utils";

/**
 * Centered max-width container used by every page section.
 * Mobile-first: comfortable side padding, wider cap on desktop.
 */
export function Container({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-6xl px-5 sm:px-8", className)}>
      {children}
    </div>
  );
}
