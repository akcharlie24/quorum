import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Quorum — the reliability layer for Bright Data scrapers",
  description:
    "Quorum runs three independently-written Bright Data scrapers against every URL and ships only what they agree on — catching the silent breakages a lone scraper never reports, and grading every self-healing repair before it goes live.",
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
