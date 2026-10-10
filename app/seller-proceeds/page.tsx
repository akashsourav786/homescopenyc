import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "Seller Proceeds" };

export default function SellerProceedsPage() {
  return (
    <PlaceholderPage
      title="Seller Proceeds"
      stage="Stage 5"
      description="The seller net proceeds calculator arrives in Stage 5: estimated net proceeds with an itemized breakdown of NYC-specific closing costs, transfer taxes, and multiple sale-price scenarios."
    />
  );
}
