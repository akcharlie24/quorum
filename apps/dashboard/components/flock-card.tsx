"use client";

import type { TargetSummary } from "@silk/core";
import { timeAgo } from "@/lib/format";

/**
 * One target in the console grid. Health is the vote's verdict; drift is a separate
 * detector that can fire while every scraper is green, so it sits beside the pill
 * rather than inside it.
 */
export function FlockCard({ t }: { t: TargetSummary }) {
  const stats = [
    { k: t.variantCount, v: "scrapers" },
    { k: t.consensusRows, v: "rows" },
    { k: t.runCount, v: "runs" },
    { k: t.healApproved, v: "healed" },
  ];

  return (
    <a className="tcard" href={`/flock/${encodeURIComponent(t.name)}`}>
      <div className="tcard-head">
        <h3>{t.name}</h3>
        <span className={`pill pill-${t.health}`}>{t.health}</span>
      </div>

      <div className="url">{t.url}</div>

      {t.openAlerts > 0 && (
        <div className="tcard-drift">
          <span className={`drift-mark${t.worstAlert === "critical" ? " is-critical" : ""}`}>
            ◈ Spider-Sense: {t.openAlerts} {t.openAlerts === 1 ? "signal" : "signals"}
          </span>
        </div>
      )}

      <div className="tcard-stats">
        {stats.map((s) => (
          <div className="stat" key={s.v}>
            <div className="k">{s.k}</div>
            <div className="v">{s.v}</div>
          </div>
        ))}
      </div>

      <div className="tcard-foot">
        <span className="mono">LAST RUN {timeAgo(t.lastRunAt).toUpperCase()}</span>
        <span className="tcard-go" aria-hidden>→</span>
      </div>
    </a>
  );
}
