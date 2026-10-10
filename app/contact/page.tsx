import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "Contact Akash" };

export default function ContactPage() {
  return (
    <PlaceholderPage
      title="Contact Akash"
      stage="Stage 2"
      description="The contact page arrives in Stage 2: professional contact details and the consultation request form. [Placeholder]"
    />
  );
}
