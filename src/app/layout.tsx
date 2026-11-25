import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { Robot } from "@/components/Robot";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { themeScript } from "@/lib/theme";
import { site } from "@/lib/site";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

// Only for code-like bits inside the tools; the dashboard itself uses Geist throughout.
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Dashboard",
    template: "%s · Dashboard",
  },
  description: site.description,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geist.variable} ${geistMono.variable} h-full`}
      // The theme script sets data-theme before React hydrates.
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <Script id="theme" strategy="beforeInteractive">
          {themeScript}
        </Script>
        <SiteHeader />
        <main className="mx-auto w-full max-w-[75rem] flex-1 px-4 sm:px-6">{children}</main>
        <SiteFooter />
        <Robot />
      </body>
    </html>
  );
}
