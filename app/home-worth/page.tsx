import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "What's My Home Worth?" };

export default function HomeWorthPage() {
  return (
    <PlaceholderPage
      title="What's My Home Worth?"
      stage="Stage 7"
      description="The home value watchlist arrives in Stage 7: nearby closed sales, market updates, and value ranges — clearly labeled as estimates, never as appraisals."
    />
  );
}
