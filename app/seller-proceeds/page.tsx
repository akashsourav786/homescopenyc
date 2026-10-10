import type { Metadata } from "next";
import { SellerProceedsCalculator } from "@/components/seller-proceeds/seller-proceeds-calculator";

export const metadata: Metadata = {
  title: "Seller Proceeds",
  description:
    "Estimate your net proceeds from an NYC sale — the sale price minus mortgage payoffs, broker commission, transfer taxes, and closing costs, shown as an itemized breakdown.",
};

export default function SellerProceedsPage() {
  return <SellerProceedsCalculator />;
}
