import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SILK — Flock Control",
  description: "The immune system for web scrapers.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <header className="topbar">
            <a href="/" className="brand">
              <div className="brand-mark">🕷</div>
              <div>
                <h1>SILK</h1>
                <div className="tag">THE IMMUNE SYSTEM FOR WEB SCRAPERS</div>
              </div>
            </a>
            <nav className="topnav">
              <a href="/">Flocks</a>
              <a href="/how-it-works">How it works</a>
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
