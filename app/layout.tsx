import type { Metadata } from "next";
import { Inter, Inter_Tight } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

// Self-hosted-at-build fonts via next/font: CSS variables --font-inter and
// --font-inter-tight, consumed by globals.css. No runtime CDN dependency.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const interTight = Inter_Tight({
  subsets: ["latin"],
  weight: ["700", "800"],
  variable: "--font-inter-tight",
});

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
      className={`h-full antialiased ${inter.variable} ${interTight.variable}`}
    >
      <head>
        {/* next/font injects its own preloads + @font-face; nothing manual needed. */}
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
