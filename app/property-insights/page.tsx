import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "Property Insights" };

export default function PropertyInsightsPage() {
  return (
    <PlaceholderPage
      title="Property Insights"
      stage="Stage 6"
      description="Property intelligence reports arrive in Stage 6: NYC address lookup powered by official public datasets, with source links, dates, and data limitations — never invented data."
    />
  );
}
