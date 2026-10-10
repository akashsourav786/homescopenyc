import type { Metadata } from "next";
import { MonthlyCostCalculator } from "@/components/monthly-cost/monthly-cost-calculator";

export const metadata: Metadata = {
  title: "True Monthly Cost",
  description:
    "Break down the true monthly cost of an NYC home — principal & interest, taxes, insurance, mortgage insurance, and HOA — plus your cash to close, including the mortgage recording tax and mansion tax.",
};

export default function MonthlyCostPage() {
  return <MonthlyCostCalculator />;
}
