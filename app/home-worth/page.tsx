import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "What's My Home Worth?" };

export default function HomeWorthPage() {
  return (
    <PlaceholderPage
      title="What's My Home Worth?"
      stage="Coming soon"
      description="The home value estimator is coming soon: nearby closed sales, market trends, and a value range — clearly labeled as estimates, never as appraisals."
    />
  );
}
