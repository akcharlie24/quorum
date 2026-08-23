"use client";

import { useEffect, useState } from "react";

import { VOLATILITY_WEIGHTS } from "@silk/core/browser";
import type { BugleTotals, TargetVolatility } from "@silk/core/browser";
import { Reveal } from "@/components/reveal";

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Durations here span seconds to tens of minutes; one unit for all of them reads badly. */
function duration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return "—";
  const s = ms / 1000;
  if (s < 90) return `${s.toFixed(0)}s`;
  const m = s / 60;
  if (m < 90) return `${m.toFixed(1)}m`;
  return `${(m / 60).toFixed(1)}h`;
}

/**
 * The score decomposed into the four things that produced it, so a number nobody can
 * audit becomes a bar anyone can. Widths are the weighted contributions, not the raw rates.
 */
function ScoreBar({ t }: { t: TargetVolatility }) {
  const parts = [
    { k: "breakage", v: Math.min(1, t.breakageRate) * VOLATILITY_WEIGHTS.breakageRate },
    { k: "drift", v: Math.min(1, t.driftPerRun) * VOLATILITY_WEIGHTS.driftPerRun },
    { k: "dispute", v: Math.min(1, t.disputeRate) * VOLATILITY_WEIGHTS.disputeRate },
    { k: "heals", v: Math.min(1, t.healsPerRun) * VOLATILITY_WEIGHTS.healsPerRun },
  ].filter((p) => p.v > 0.5);

  return (
    <div className="vbar" title={parts.map((p) => `${p.k} ${p.v.toFixed(0)}`).join(" · ")}>
      {parts.map((p) => (
        <span key={p.k} className={`vbar-seg vbar-${p.k}`} style={{ width: `${p.v}%` }} />
      ))}
    </div>
  );
}

export function BugleIndex() {
  const [data, setData] = useState<{ targets: TargetVolatility[]; totals: BugleTotals } | null>(null);

  useEffect(() => {
    void fetch("/api/bugle", { cache: "no-store" })
      .then((r) => r.json())
      .then(setData);
  }, []);

  if (!data) return <div className="panel empty">Reading the telemetry…</div>;
  const { targets, totals } = data;

  const healDecided = totals.healApproved + totals.healRejected;
  const approvalRate = healDecided ? totals.healApproved / healDecided : null;
  const verdicts = totals.healVerified + totals.healRegressed;

  return (
    <>
      <div className="section">
        <span className="eyebrow">Layer 3 · telemetry</span>
        <h1 className="h1" style={{ marginTop: 10 }}>The web rot index</h1>
        <p className="lede" style={{ maxWidth: "62ch", marginTop: 12 }}>
          Every cycle Quorum runs is evidence about how stable a site really is. This page is
          that evidence, aggregated — which sites break their scrapers, how fast we notice, and
          how often a repair that reported success actually held.
        </p>
      </div>

      <div className="stats" style={{ marginTop: 8 }}>
        <div className="stat-cell">
          <div className="k">{totals.runs}</div>
          <div className="v">cycles run</div>
          <div className="d">
            Across {totals.targets} {totals.targets === 1 ? "site" : "sites"} and {totals.scrapers} scrapers.
          </div>
        </div>
        <div className="stat-cell">
          <div className="k">{totals.cellsVoted.toLocaleString()}</div>
          <div className="v">cells voted on</div>
          <div className="d">Every value shipped was confirmed by more than one scraper.</div>
        </div>
        <div className="stat-cell">
          <div className="k">{totals.badReadingsBlocked.toLocaleString()}</div>
          <div className="v">readings overruled</div>
          <div className="d">Values a scraper proposed that the vote kept out of the output.</div>
        </div>
        <div className="stat-cell">
          <div className="k">{totals.silentDrift}</div>
          <div className="v">silent drifts caught</div>
          <div className="d">
            Signals every scraper agreed on. The vote is structurally incapable of raising these.
          </div>
        </div>
      </div>

      <div className="section" style={{ marginTop: 40 }}>
        <div className="section-head">
          <div>
            <span className="eyebrow no-rule">Leaderboard</span>
            <div className="h2" style={{ marginTop: 6 }}>Volatility by site</div>
          </div>
          <div className="sub faint">
            0 = never moved under us. 100 = breaks something every cycle.
          </div>
        </div>

        <div className="panel panel-flush tablewrap" style={{ borderColor: "var(--line-ink)" }}>
          <table>
            <thead>
              <tr>
                <th>Site</th>
                <th style={{ width: "24%" }}>Volatility</th>
                <th className="num">Breakage</th>
                <th className="num">Disputes</th>
                <th className="num">Drift / run</th>
                <th className="num">Detect</th>
                <th className="num">Heal</th>
                <th className="num">Runs</th>
              </tr>
            </thead>
            <tbody>
              {targets.map((t) => (
                <tr key={t.name}>
                  <td>
                    <a href={`/flock/${encodeURIComponent(t.name)}`} style={{ fontWeight: 600 }}>
                      {t.name}
                    </a>
                    {t.silentDrift > 0 && (
                      <span className="drift-mark is-critical" style={{ marginLeft: 10 }}>
                        ◈ {t.silentDrift} silent
                      </span>
                    )}
                  </td>
                  <td>
                    <div className="vscore">
                      <span className="vscore-n">{t.score}</span>
                      <ScoreBar t={t} />
                    </div>
                  </td>
                  <td className="num">{pct(t.breakageRate)}</td>
                  <td className="num">{pct(t.disputeRate)}</td>
                  <td className="num">{t.driftPerRun.toFixed(2)}</td>
                  <td className="num">{duration(t.mttdMs)}</td>
                  <td className="num">{duration(t.mtthMs)}</td>
                  <td className="num faint">{t.runs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Small-sample statistics should announce themselves rather than be discovered. */}
        <div className="sub faint" style={{ marginTop: 12, maxWidth: "70ch" }}>
          Sample sizes are in the last column. With single-digit run counts these are
          indicative, not authoritative — the index gets sharper the longer the flocks run.
          <em> Detect</em> is mean cycle duration: a fault is found within the cycle that
          produced it, so the cycle time is the detection time. <em>Heal</em> is the time from
          Bright Data proposing a fix to Quorum accepting or rejecting it.
        </div>
      </div>

      <div className="section" style={{ marginTop: 40 }}>
        <div className="section-head">
          <div>
            <span className="eyebrow no-rule">Findings</span>
            <div className="h2" style={{ marginTop: 6 }}>What the telemetry says</div>
          </div>
        </div>

        <div className="grid grid-2 gap-lg">
          <Reveal>
            <div className="panel">
              <div className="eyebrow no-rule">Self-reported success is not success</div>
              <p style={{ marginTop: 12 }}>
                {healDecided === 0 ? (
                  <>No repairs have been proposed yet, so there is nothing to report here.</>
                ) : (
                  <>
                    Bright Data proposed <strong>{healDecided}</strong>{" "}
                    {healDecided === 1 ? "fix" : "fixes"}. Quorum approved{" "}
                    <strong>{totals.healApproved}</strong> and rejected{" "}
                    <strong>{totals.healRejected}</strong> by scoring each preview against
                    consensus — {approvalRate !== null ? pct(approvalRate) : "—"} approval, with
                    no human in the loop.
                    {verdicts > 0 && (
                      <>
                        {" "}Of the approvals we have since re-checked in production,{" "}
                        <strong>{totals.healVerified}</strong> held and{" "}
                        <strong>{totals.healRegressed}</strong> did not.
                      </>
                    )}
                  </>
                )}
              </p>
              {totals.healRegressed > 0 && (
                <p style={{ marginTop: 12, color: "var(--break)" }}>
                  That last number is the reason production verification exists. A preview showed
                  100% correct rows and the deployed scraper still failed — an approval gate that
                  trusts the platform&apos;s own report would have called it a success.
                </p>
              )}
            </div>
          </Reveal>

          <Reveal delay={80}>
            <div className="panel">
              <div className="eyebrow no-rule">The failures voting cannot see</div>
              <p style={{ marginTop: 12 }}>
                {totals.driftSignals === 0 ? (
                  <>
                    Spider-Sense has not raised a signal yet. It needs at least three runs of
                    history per site before it will judge anything.
                  </>
                ) : (
                  <>
                    Spider-Sense has raised <strong>{totals.driftSignals}</strong>{" "}
                    {totals.driftSignals === 1 ? "signal" : "signals"} by comparing each run
                    against its own site&apos;s history.{" "}
                    <strong>{totals.silentDrift}</strong> of those fired while every scraper was
                    healthy and unanimous.
                  </>
                )}
              </p>
              {totals.silentDrift > 0 && (
                <p style={{ marginTop: 12 }}>
                  Consensus works by disagreement, so a fault all three scrapers share is
                  invisible to it — they were each reading the page correctly. Those{" "}
                  {totals.silentDrift} would have shipped clean through any amount of
                  redundancy, and through a single scraper too.
                </p>
              )}
            </div>
          </Reveal>
        </div>
      </div>
    </>
  );
}
