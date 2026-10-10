import type { Metadata } from "next";
import { Suspense } from "react";
import { PropertyInsights } from "@/components/property-insights/property-insights";
import { Container } from "@/components/container";

export const metadata: Metadata = {
  title: "Property Insights",
  description:
    "Look up any NYC address for public-record details and recent sales — or compare two properties side by side. Powered by NYC Open Data.",
};

export default function PropertyInsightsPage() {
  return (
    <Suspense
      fallback={
        <Container className="max-w-3xl py-8 sm:py-12">
          <div className="h-10 w-48 animate-pulse rounded-xl bg-accent-soft" />
        </Container>
      }
    >
      <PropertyInsights />
    </Suspense>
  );
}
