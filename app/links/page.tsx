import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CreatorPhoto } from "@/components/creator-photo";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Links",
  description:
    "Every way to reach Akash Rahman Sourav — search homes, run the free Property Lab tools, or book a consultation.",
};

interface LinkItem {
  title: string;
  sub: string;
  href: string;
  external?: boolean;
  primary?: boolean;
}

/** Order matters: agent site first, Property Lab second, then the rest. */
const LINKS: LinkItem[] = [
  {
    title: "Search homes · my agent site",
    sub: "akashsellsnyc.com",
    href: "https://akashsellsnyc.com",
    external: true,
    primary: true,
  },
  {
    title: "Property Lab",
    sub: "Free NYC buyer & seller tools — no signup",
    href: "/",
  },
  {
    title: "About Akash",
    sub: "The agent who codes — a little about me",
    href: "/about",
  },
  {
    title: "Book a free consultation",
    sub: "Buying, selling, or investing — let's talk numbers",
    href: "/contact",
  },
  {
    title: "How much can you afford?",
    sub: "The buying-power calculator",
    href: "/buying-power",
  },
  {
    title: "What would you net from a sale?",
    sub: "The seller proceeds calculator",
    href: "/seller-proceeds",
  },
  {
    title: "Call or text me",
    sub: "631-833-3320",
    href: "tel:+16318333320",
    external: true,
  },
];

function LinkButton({ item }: { item: LinkItem }) {
  const className = cn(
    "group flex items-center gap-3 rounded-2xl border px-5 py-4 transition-colors",
    item.primary
      ? "border-accent bg-accent text-accent-foreground"
      : "border-border bg-card hover:border-accent",
  );
  const inner = (
    <>
      <span className="min-w-0 flex-1">
        {/* Relaxed tracking per Akash's note — display type set tight
            reads cramped at button sizes. */}
        <span className="block font-display text-[17px] font-bold tracking-[0.01em]">
          {item.title}
        </span>
        <span
          className={cn(
            "mt-0.5 block text-[13px]",
            item.primary ? "text-accent-foreground/80" : "text-muted",
          )}
        >
          {item.sub}
        </span>
      </span>
      <ArrowRight
        className={cn(
          "h-5 w-5 shrink-0",
          item.primary ? "text-accent-foreground" : "text-accent-strong",
        )}
        aria-hidden
      />
    </>
  );
  return item.external ? (
    <a href={item.href} className={className}>
      {inner}
    </a>
  ) : (
    <Link href={item.href} className={className}>
      {inner}
    </Link>
  );
}

export default function LinksPage() {
  return (
    <div className="mx-auto w-full max-w-md px-5 py-10 sm:py-14">
      <div className="text-center">
        <CreatorPhoto className="mx-auto h-24 w-24 ring-2 ring-accent ring-offset-2 ring-offset-background" />
        <h1 className="mt-5 font-display text-[28px] font-extrabold tracking-[0.01em]">
          Akash Rahman Sourav
        </h1>
        <p className="mt-1.5 text-[13px] text-muted">
          Licensed Real Estate Salesperson · EXIT Realty DKC
        </p>
        <p className="mt-4 text-[15px] leading-relaxed">
          The agent who codes.
          <br />
          <span className="text-muted">
            Numbers, patterns, and finding the right match.
          </span>
        </p>
      </div>

      <nav aria-label="Akash's links" className="mt-8 flex flex-col gap-3">
        {LINKS.map((item) => (
          <LinkButton key={item.href} item={item} />
        ))}
      </nav>
    </div>
  );
}
