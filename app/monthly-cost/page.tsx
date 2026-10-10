import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "True Monthly Cost" };

export default function MonthlyCostPage() {
  return (
    <PlaceholderPage
      title="True Monthly Cost"
      stage="Stage 4"
      description="The true monthly cost calculator arrives in Stage 4: principal & interest, property taxes, insurance, mortgage insurance, HOA, and cash to close — with a transparent breakdown."
    />
  );
}
