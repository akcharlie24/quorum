import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Quorum — no single scraper is trusted",
  description:
    "Quorum runs three independently-written scrapers against every URL and ships only what they agree on — catching the silent breakages a lone scraper never reports, and grading every self-healing repair before it goes live.",
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
