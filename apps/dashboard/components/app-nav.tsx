"use client";

import { usePathname } from "next/navigation";

import { Logo } from "./logo";

const LINKS = [
  { href: "/dashboard", label: "Flocks", also: ["/flock"] },
  { href: "/bugle", label: "Daily Bugle", also: [] },
  { href: "/how-it-works", label: "How it works", also: [] },
];

export function AppNav() {
  const path = usePathname();
  return (
    <header className="appbar">
      <div className="appbar-in">
        <Logo size={24} tag="Consensus console" href="/dashboard" />
        <nav className="appnav">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className={
                path === l.href || [l.href, ...l.also].some((p) => path.startsWith(p + "/")) ? "active" : ""
              }
            >
              {l.label}
            </a>
          ))}
          <a href="/" className="hide-sm" style={{ color: "var(--ink-4)" }}>
            ← Site
          </a>
        </nav>
      </div>
    </header>
  );
}
