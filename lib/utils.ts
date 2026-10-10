import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * cn() — merges Tailwind class lists, resolving conflicts.
 * Standard shadcn/ui utility.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
