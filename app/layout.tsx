import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
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
      className={`${inter.variable} h-full antialiased`}
    >
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
