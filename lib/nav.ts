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
  description: string;
  href: string;
  icon: LucideIcon;
  /** Which pastel/muted surface token to use for the icon tile. */
  tile: string;
  stage: string;
}

/** The six toolkit cards shown on the homepage. */
export const TOOLS: ToolDef[] = [
  {
    title: "How Much Can I Buy?",
    description:
      "Estimate your buying power from income, debts, savings, and loan assumptions — with clear scenarios.",
    href: "/buying-power",
    icon: Calculator,
    tile: "bg-pastel-blue text-foreground",
    stage: "Stage 3",
  },
  {
    title: "True Monthly Cost",
    description:
      "See the full monthly picture: principal & interest, taxes, insurance, HOA, and cash to close.",
    href: "/monthly-cost",
    icon: BadgeDollarSign,
    tile: "bg-pastel-mint text-foreground",
    stage: "Stage 4",
  },
  {
    title: "Property Insights",
    description:
      "Look up an NYC address and review public-record details, permits, violations, and nearby sales.",
    href: "/property-insights",
    icon: Building2,
    tile: "bg-pastel-lavender text-foreground",
    stage: "Stage 6",
  },
  {
    title: "What's My Home Worth?",
    description:
      "Track your home's value range with nearby closed sales and local market trends.",
    href: "/home-worth",
    icon: LineChart,
    tile: "bg-pastel-peach text-foreground",
    stage: "Stage 7",
  },
  {
    title: "Seller Proceeds",
    description:
      "Estimate your net proceeds with an itemized breakdown of NYC closing costs and transfer taxes.",
    href: "/seller-proceeds",
    icon: HandCoins,
    tile: "bg-pastel-mint text-foreground",
    stage: "Stage 5",
  },
  {
    title: "Compare Homes",
    description:
      "Compare properties side by side — price, monthly cost, taxes, and public-record findings.",
    href: "/property-insights",
    icon: ArrowLeftRight,
    tile: "bg-pastel-blue text-foreground",
    stage: "Stage 7",
  },
];
