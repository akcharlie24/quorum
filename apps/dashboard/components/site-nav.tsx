"use client";

import { useEffect, useState } from "react";
import { Logo } from "./logo";

export function SiteNav() {
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav className={`site-nav ${stuck ? "stuck" : ""}`}>
      <div className="site-nav-in">
        <Logo
          size={26}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
            e.preventDefault();
            window.scrollTo({ top: 0, behavior: "smooth" });
            history.replaceState(null, "", "/");
          }}
        />
        <div className="site-links">
          <a href="#how" className="hide-sm">How it works</a>
          <a href="#drift" className="hide-sm">Silent drift</a>
          <a href="#healing" className="hide-sm">Verified healing</a>
          <a href="#faq" className="hide-sm">FAQ</a>
          <a className="btn btn-nav" href="/dashboard" style={{ marginLeft: 4 }}>
            <span>Open the console</span>
            <span className="arrow">→</span>
          </a>
        </div>
      </div>
    </nav>
  );
}
