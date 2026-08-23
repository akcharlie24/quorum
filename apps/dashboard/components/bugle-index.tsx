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
 * The four weighted contributions, in bar order. Four distinct hues rather than two
 * ambers side by side — the old drift/dispute pair differed only in lightness, which
 * is the first thing to go under colour-vision deficiency.
 */
const PARTS = [
  { k: "breakage", label: "Breakage", weight: VOLATILITY_WEIGHTS.breakageRate, of: (t: TargetVolatility) => t.breakageRate },
  { k: "drift", label: "Drift", weight: VOLATILITY_WEIGHTS.driftPerRun, of: (t: TargetVolatility) => t.driftPerRun },
  { k: "dispute", label: "Disputes", weight: VOLATILITY_WEIGHTS.disputeRate, of: (t: TargetVolatility) => t.disputeRate },
  { k: "heals", label: "Repairs", weight: VOLATILITY_WEIGHTS.healsPerRun, of: (t: TargetVolatility) => t.healsPerRun },
] as const;

/**
 * The score decomposed into the four things that produced it, so a number nobody can
 * audit becomes a bar anyone can. Widths are the weighted contributions, not raw rates.
 */
function ScoreBar({ t }: { t: TargetVolatility }) {
  const segs = PARTS.map((p) => ({ ...p, v: Math.min(1, p.of(t)) * p.weight })).filter((p) => p.v >= 0.5);
  return (
    <div className="vbar" role="img" aria-label={segs.map((p) => `${p.label} ${p.v.toFixed(0)}`).join(", ") || "no contributions"}>
      {segs.map((p) => (
        <span key={p.k} className={`vbar-seg vbar-${p.k}`} style={{ width: `${p.v}%` }} title={`${p.label} ${p.v.toFixed(0)}`} />
      ))}
    </div>
  );
}

type BugleData = { targets: TargetVolatility[]; totals: BugleTotals };

export function BugleIndex({ initial }: { initial?: BugleData }) {
  const [data, setData] = useState<BugleData | null>(initial ?? null);

  useEffect(() => {
    if (initial) return;
    void fetch("/api/bugle", { cache: "no-store" })
      .then((r) => r.json())
      .then(setData);
  }, [initial]);

  if (!data) return <div className="panel empty">Reading the telemetry…</div>;
  const { targets, totals } = data;

  const healDecided = totals.healApproved + totals.healRejected;
  const approvalRate = healDecided ? totals.healApproved / healDecided : null;
  const verdicts = totals.healVerified + totals.healRegressed;

  return (
    <>
      {/* ── masthead: what the page is, and how to read its one invented number ── */}
      <header className="bugle-head">
        <div className="bugle-title">
          <span className="eyebrow no-rule">Layer 3 · telemetry</span>
          <h1>The web rot index</h1>
          <p>
            Every cycle Quorum runs is evidence about how stable a site really is. This page is
            that evidence, aggregated — which sites break their scrapers, how fast we notice, and
            how often a repair that reported success actually held.
          </p>
        </div>

        <div className="bugle-key">
          <div className="bugle-key-top">
            <span className="bugle-key-label">Volatility is built from</span>
            <span className="bugle-key-scale">0 — 100</span>
          </div>
          <ul className="bugle-key-list">
            {PARTS.map((p) => (
              <li key={p.k}>
                <span className={`vkey-swatch vbar-${p.k}`} aria-hidden />
                <span className="vkey-label">{p.label}</span>
                <span className="vkey-weight">{p.weight}</span>
              </li>
            ))}
          </ul>
          <p className="bugle-key-note">Weights out of 100. Each bar below is these four, to scale.</p>
        </div>
      </header>

      <div className="stats">
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
        <div className="stat-cell is-headline">
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
          <table className="lboard">
            <thead>
              <tr>
                <th className="lb-rank">#</th>
                <th>Site</th>
                <th style={{ width: "28%" }}>Volatility</th>
                <th className="num">Breakage</th>
                <th className="num">Disputes</th>
                <th className="num">Drift / run</th>
                <th className="num">Detect</th>
                <th className="num">Heal</th>
                <th className="num">Runs</th>
              </tr>
            </thead>
            <tbody>
              {targets.map((t, i) => (
                <tr key={t.name}>
                  <td className="lb-rank">{String(i + 1).padStart(2, "0")}</td>
                  <td>
                    <a className="lb-name" href={`/flock/${encodeURIComponent(t.name)}`}>{t.name}</a>
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
        <dl className="methodology">
          <div>
            <dt>Sample size</dt>
            <dd>
              In the last column. With single-digit run counts these are indicative, not
              authoritative — the index sharpens the longer the flocks run.
            </dd>
          </div>
          <div>
            <dt>Detect</dt>
            <dd>
              Mean cycle duration. A fault is found within the cycle that produced it, so the
              cycle time is the detection time.
            </dd>
          </div>
          <div>
            <dt>Heal</dt>
            <dd>
              Time from Bright Data proposing a fix to Quorum accepting or rejecting it.
            </dd>
          </div>
        </dl>
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
            <article className="finding">
              <h3>Self-reported success is not success</h3>
              <p>
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
                <p className="finding-punch">
                  That last number is the reason production verification exists. A preview showed
                  100% correct rows and the deployed scraper still failed — an approval gate that
                  trusts the platform&apos;s own report would have called it a success.
                </p>
              )}
            </article>
          </Reveal>

          <Reveal delay={80}>
            <article className="finding">
              <h3>The failures voting cannot see</h3>
              <p>
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
                <p className="finding-punch">
                  Consensus works by disagreement, so a fault all three scrapers share is
                  invisible to it — they were each reading the page correctly. Those{" "}
                  {totals.silentDrift} would have shipped clean through any amount of redundancy,
                  and through a single scraper too.
                </p>
              )}
            </article>
          </Reveal>
        </div>
      </div>
    </>
  );
}
