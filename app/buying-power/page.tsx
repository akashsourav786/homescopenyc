import type { Metadata } from "next";
import { BuyingPowerCalculator } from "@/components/buying-power/buying-power-calculator";

export const metadata: Metadata = {
  title: "How Much Can I Buy?",
  description:
    "Estimate your NYC buying power from income, debts, savings, and loan assumptions — or as an investor, from the property's rent with a DSCR loan.",
};

export default function BuyingPowerPage() {
  return <BuyingPowerCalculator />;
}
