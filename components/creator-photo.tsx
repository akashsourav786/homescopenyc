import { cn } from "@/lib/utils";

/**
 * CreatorPhoto — the creator's portrait slot.
 *
 * TODO: replace the AR monogram with Akash's professional headshot when
 * provided. Swap the inner <span> for a next/image <Image> (or <img>)
 * pointing at the headshot file; keep the same rounded-full frame and
 * sizing API so every usage updates at once.
 */
export function CreatorPhoto({
  className,
}: {
  /** Extra sizing classes, e.g. "h-14 w-14 text-lg". Defaults to h-20 w-20. */
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label="Portrait of Akash Rahman Sourav (placeholder monogram)"
      className={cn(
        "flex h-20 w-20 shrink-0 items-center justify-center rounded-full",
        "bg-pastel-lavender text-2xl font-bold text-pastel-lavender-ink",
        className,
      )}
    >
      AR
    </span>
  );
}
