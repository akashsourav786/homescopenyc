import type { Metadata } from "next";
import { HomeWorth } from "@/components/home-worth/home-worth";

export const metadata: Metadata = {
  title: "What's My Home Worth?",
  description:
    "Get a transparent, comp-based value range for your NYC home from recent nearby closed sales. An estimate — never an appraisal.",
};

export default function HomeWorthPage() {
  return <HomeWorth />;
}
