import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "About Akash" };

export default function AboutPage() {
  return (
    <PlaceholderPage
      title="About Akash"
      stage="Stage 2"
      description="The full About the Creator page arrives in Stage 2: Akash Rahman's story, his Computer Science & Data Science background, professional photo, and brokerage details. [Placeholder]"
    />
  );
}
