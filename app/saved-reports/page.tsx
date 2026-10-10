import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "Saved Reports" };

export default function SavedReportsPage() {
  return (
    <PlaceholderPage
      title="Saved Reports"
      stage="Stage 8"
      description="Saved reports arrive in Stage 8 with Supabase authentication: save calculator results, download PDF summaries, and reopen previous scenarios."
    />
  );
}
