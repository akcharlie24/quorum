"use client";

import { useEffect, useRef, useState } from "react";

const ROWS = [
  { m: "Class / id rename", single: 12, quorum: 96 },
  { m: "DOM restructure", single: 20, quorum: 88 },
  { m: "Field removed", single: 8, quorum: 92 },
  { m: "Silent value corruption", single: 0, quorum: 100 },
  { m: "Pagination change", single: 34, quorum: 80 },
];

export function Survival() {
  const ref = useRef<HTMLDivElement>(null);
  const [go, setGo] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        setGo(true);
        io.disconnect();
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref}>
      <div style={{ display: "flex", gap: 20, marginBottom: 20 }}>
        <span className="mono" style={{ fontSize: 10.5, letterSpacing: ".08em", color: "var(--ink-3)", display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ width: 12, height: 12, background: "var(--line-2)", display: "inline-block" }} /> ONE SCRAPER
        </span>
        <span className="mono" style={{ fontSize: 10.5, letterSpacing: ".08em", color: "var(--ink-3)", display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ width: 12, height: 12, background: "var(--agree)", display: "inline-block" }} /> QUORUM OF THREE
        </span>
      </div>

      {ROWS.map((r, i) => (
        <div key={r.m} style={{ padding: "13px 0", borderTop: "1px solid var(--line)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: "var(--ink)", fontWeight: 500 }}>{r.m}</span>
            <span className="mono" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
              {r.single}% → <strong style={{ color: "var(--agree)" }}>{r.quorum}%</strong>
            </span>
          </div>
          <div style={{ display: "grid", gap: 4 }}>
            <div style={{ height: 8, background: "var(--paper-2)" }}>
              <div
                style={{
                  height: "100%", background: "var(--line-2)",
                  width: go ? `${r.single}%` : 0,
                  transition: `width .9s cubic-bezier(.22,.61,.36,1) ${i * 80}ms`,
                }}
              />
            </div>
            <div style={{ height: 8, background: "var(--paper-2)" }}>
              <div
                style={{
                  height: "100%", background: "var(--agree)",
                  width: go ? `${r.quorum}%` : 0,
                  transition: `width .9s cubic-bezier(.22,.61,.36,1) ${i * 80 + 120}ms`,
                }}
              />
            </div>
          </div>
        </div>
      ))}
      <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12, marginTop: 2 }}>
        <span className="sub faint" style={{ fontSize: 11.5 }}>
          Measured on the Breakage Lab — a store whose layout we mutate on command, replayed against every variant.
        </span>
      </div>
    </div>
  );
}
