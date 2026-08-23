/**
 * The Daily Bugle's scoring rules and result shapes — pure, so the dashboard can import
 * them client-side without dragging Prisma into the browser bundle. The queries that
 * produce these numbers live in bugle.ts.
 */

export interface VolatilityParts {
  /** Share of variant-runs that came back broken or outvoted. */
  breakageRate: number;
  /** Share of voted cells where the scrapers did not agree. */
  disputeRate: number;
  /** Spider-Sense signals raised per run. */
  driftPerRun: number;
  /** Heals attempted per run. */
  healsPerRun: number;
}

/**
 * Weights are exported so the page can show the decomposition rather than a magic number.
 *
 * Breakage leads because an outright failure is the least ambiguous evidence a site is
 * hostile. Drift is weighted close behind: a signal only Spider-Sense can see is rarer
 * and more damning than a dispute the vote resolved on its own.
 */
export const VOLATILITY_WEIGHTS = {
  breakageRate: 40,
  disputeRate: 20,
  driftPerRun: 30,
  healsPerRun: 10,
} as const;

/** 0 = the site never moved under us; 100 = it breaks something every single cycle. */
export function volatilityScore(p: VolatilityParts): number {
  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  const score =
    VOLATILITY_WEIGHTS.breakageRate * clamp(p.breakageRate) +
    VOLATILITY_WEIGHTS.disputeRate * clamp(p.disputeRate) +
    // Rates per run are unbounded above; one signal per run is already "always drifting".
    VOLATILITY_WEIGHTS.driftPerRun * clamp(p.driftPerRun) +
    VOLATILITY_WEIGHTS.healsPerRun * clamp(p.healsPerRun);
  return Math.round(score);
}

export interface TargetVolatility extends VolatilityParts {
  name: string;
  url: string;
  itemLabel: string;
  /** Sample size. These are small-sample statistics and the page says so. */
  runs: number;
  score: number;
  /** Mean run duration — we detect within a single cycle, so this IS time-to-detect. */
  mttdMs: number | null;
  /** Heal proposed -> heal decided, approvals only. */
  mtthMs: number | null;
  /** Heal approved -> the later run that proved it actually worked in production. */
  mttvMs: number | null;
  healApproved: number;
  healRejected: number;
  healVerified: number;
  healRegressed: number;
  /** Signals every scraper agreed on — what consensus alone would have shipped. */
  silentDrift: number;
  cellsVoted: number;
  badReadingsBlocked: number;
}

export interface BugleTotals {
  targets: number;
  runs: number;
  scrapers: number;
  cellsVoted: number;
  badReadingsBlocked: number;
  healsProposed: number;
  healApproved: number;
  healRejected: number;
  healVerified: number;
  healRegressed: number;
  silentDrift: number;
  driftSignals: number;
}

