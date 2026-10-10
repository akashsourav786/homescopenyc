import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "How Much Can I Buy?" };

export default function BuyingPowerPage() {
  return (
    <PlaceholderPage
      title="How Much Can I Buy?"
      stage="Stage 3"
      description="The buyer qualification calculator arrives in Stage 3: income, debts, savings, down payment, and loan assumptions — with transparent scenarios and clearly dated loan-program rules."
    />
  );
}
