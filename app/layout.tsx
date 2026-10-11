import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

// Fonts are self-hosted in /public/fonts (see globals.css @font-face).
// Preload the two headline/body workhorses to avoid a flash of fallback type.
const FONT_PRELOADS = [
  "/fonts/InterTight-800.woff2",
  "/fonts/Inter-500.woff2",
];

export const metadata: Metadata = {
  title: {
    default: "HomeScope NYC — Free NYC Real Estate Toolkit",
    template: "%s · HomeScope NYC",
  },
  description:
    "Free, mobile-first real estate tools for NYC buyers and sellers — created by Akash Rahman, NY Licensed Real Estate Salesperson, EXIT Realty DKC.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      // The theme script sets the .dark class before paint; hydration must
      // not warn about the class attribute mismatch.
      suppressHydrationWarning
      className="h-full antialiased"
    >
      <head>
        {FONT_PRELOADS.map((href) => (
          <link
            key={href}
            rel="preload"
            href={href}
            as="font"
            type="font/woff2"
            crossOrigin="anonymous"
          />
        ))}
      </head>
      <body className="flex min-h-full flex-col">
        <ThemeProvider>
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <SiteFooter />
        </ThemeProvider>
      </body>
    </html>
  );
}
