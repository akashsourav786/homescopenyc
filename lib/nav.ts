import {
  ArrowLeftRight,
  BadgeDollarSign,
  BookmarkCheck,
  Building2,
  Calculator,
  HandCoins,
  Home,
  Info,
  LineChart,
  Mail,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

/** Primary navigation — also drives the mobile menu and footer. */
export const NAV_ITEMS: NavItem[] = [
  { label: "Home", href: "/", icon: Home },
  { label: "How Much Can I Buy?", href: "/buying-power", icon: Calculator },
  { label: "True Monthly Cost", href: "/monthly-cost", icon: BadgeDollarSign },
  { label: "Property Insights", href: "/property-insights", icon: Building2 },
  { label: "What's My Home Worth?", href: "/home-worth", icon: LineChart },
  { label: "Seller Proceeds", href: "/seller-proceeds", icon: HandCoins },
  { label: "Saved Reports", href: "/saved-reports", icon: BookmarkCheck },
  { label: "About Akash", href: "/about", icon: Info },
  { label: "Contact Akash", href: "/contact", icon: Mail },
];

export interface ToolDef {
  title: string;
  /** One-line tagline used in the homepage tool rows. */
  tagline: string;
  description: string;
  href: string;
  icon: LucideIcon;
  /** Pastel chip background token class. */
  tile: string;
  /** Toned icon color token class for the chip. */
  ink: string;
  stage: string;
}

/** The six toolkit rows shown on the homepage. */
export const TOOLS: ToolDef[] = [
  {
    title: "How Much Can I Buy?",
    tagline: "Estimate your buying power",
    description:
      "Estimate your buying power from income, debts, savings, and loan assumptions — with clear scenarios.",
    href: "/buying-power",
    icon: Calculator,
    tile: "bg-pastel-blue",
    ink: "text-pastel-blue-ink",
    stage: "Live",
  },
  {
    title: "True Monthly Cost",
    tagline: "Monthly payment breakdown",
    description:
      "See the full monthly picture: principal & interest, taxes, insurance, HOA, and cash to close.",
    href: "/monthly-cost",
    icon: BadgeDollarSign,
    tile: "bg-pastel-mint",
    ink: "text-pastel-mint-ink",
    stage: "Stage 4",
  },
  {
    title: "Property Insights",
    tagline: "Research a property",
    description:
      "Look up an NYC address and review public-record details, permits, violations, and nearby sales.",
    href: "/property-insights",
    icon: Building2,
    tile: "bg-pastel-lavender",
    ink: "text-pastel-lavender-ink",
    stage: "Stage 6",
  },
  {
    title: "What's My Home Worth?",
    tagline: "Get an estimated value",
    description:
      "Track your home's value range with nearby closed sales and local market trends.",
    href: "/home-worth",
    icon: LineChart,
    tile: "bg-pastel-peach",
    ink: "text-pastel-peach-ink",
    stage: "Stage 7",
  },
  {
    title: "Seller Proceeds",
    tagline: "Estimate what you'll keep",
    description:
      "Estimate your net proceeds with an itemized breakdown of NYC closing costs and transfer taxes.",
    href: "/seller-proceeds",
    icon: HandCoins,
    tile: "bg-pastel-mint",
    ink: "text-pastel-mint-ink",
    stage: "Stage 5",
  },
  {
    title: "Compare Homes",
    tagline: "Side-by-side comparison",
    description:
      "Compare properties side by side — price, monthly cost, taxes, and public-record findings.",
    href: "/property-insights",
    icon: ArrowLeftRight,
    tile: "bg-pastel-blue",
    ink: "text-pastel-blue-ink",
    stage: "Stage 7",
  },
];
