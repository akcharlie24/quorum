"use client";

import { useEffect, useState } from "react";


const ROWS = [
  { name: "Spider-Grip Gloves", price: "48.00", stock: "14", ok: true },
  { name: "Web-Shooter Cartridge", price: "129.99", stock: "6", ok: false },
  { name: "Impact Weave Hoodie", price: "89.50", stock: "22", ok: true },
  { name: "Tensile Cable, 30m", price: "17.25", stock: "51", ok: true },
];

const VARIANTS = [
  { label: "CSS selectors", status: "healthy", id: "c_mt4exizof…" },
  { label: "Text anchors", status: "healthy", id: "c_9plq2vkdn…" },
  { label: "DOM structure", status: "dissenting", id: "c_x7ba0eusr…" },
];

export function ConsolePreview() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 2600);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="panel panel-flush" style={{ borderColor: "var(--line-ink)" }}>
      <div
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          padding: "10px 14px", borderBottom: "1px solid var(--line-ink)", background: "var(--paper-2)",
        }}
      >
        <span className="mono" style={{ fontSize: 10.5, letterSpacing: ".08em", color: "var(--ink-3)" }}>
          quorum / webhead-gear
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span className="live-dot" />
          <span className="mono" style={{ fontSize: 10, letterSpacing: ".08em", color: "var(--ink-3)" }}>
            CYCLE {String(184 + tick).padStart(3, "0")}
          </span>
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, background: "var(--line)" }}>
        {VARIANTS.map((v) => (
          <div key={v.label} style={{ background: "var(--card)", padding: "12px 14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 5 }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink)", fontFamily: "var(--display)" }}>{v.label}</span>
              <span className={`pill pill-${v.status}`} style={{ fontSize: 9 }}>{v.status}</span>
            </div>
            <span className="mono" style={{ fontSize: 10, color: "var(--ink-4)" }}>{v.id}</span>
          </div>
        ))}
      </div>

      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>name · key</th>
              <th>price</th>
              <th>stock</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.name}>
                <td>{r.name}</td>
                <td className={`num ${r.ok ? "" : "cell-disputed"}`}>
                  {r.price}
                  {!r.ok && <span className="disputed-note">DOM structure said 0.00 — outvoted 2–1</span>}
                </td>
                <td className="num">{r.stock}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
          padding: "12px 14px", borderTop: "1px solid var(--line)", background: "var(--paper-2)",
        }}
      >
        <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)" }}>
          4 rows · 1 disputed cell resolved by vote
        </span>
        <span className="pill pill-brand pill-plain" style={{ fontSize: 9.5 }}>
          repair queued for DOM structure
        </span>
      </div>
    </div>
  );
}
