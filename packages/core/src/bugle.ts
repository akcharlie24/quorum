import { cached } from "./cache.ts";
import { prisma } from "./prisma.ts";
import type { Row, TargetSchema } from "./types.ts";
import { volatilityScore, type BugleTotals, type TargetVolatility, type VolatilityParts } from "./volatility.ts";

export * from "./volatility.ts";

/**
 * The Daily Bugle — a volatility index over the telemetry Layers 1 and 2 already write.
 *
 * Pure read side: no scraping, no Bright Data calls, no new data collection. Every number
 * here is a consequence of runs that already happened, which is what makes it free to
 * compute and honest to publish.
 */

const mean = (xs: number[]): number | null =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

/** Recomputed at most twice a minute; a volatility index does not move faster than that. */
export function volatilityIndex(): Promise<{ targets: TargetVolatility[]; totals: BugleTotals }> {
  return cached("bugle", 30_000, computeVolatilityIndex);
}

async function computeVolatilityIndex(): Promise<{ targets: TargetVolatility[]; totals: BugleTotals }> {
  const targets = await prisma.target.findMany({ orderBy: { id: "asc" } });

  const rows: TargetVolatility[] = [];
  for (const t of targets) {
    const runs = await prisma.run.findMany({
      where: { target_id: t.id, finished_at: { not: null } },
      orderBy: { id: "asc" },
      select: { id: true, started_at: true, finished_at: true, consensus_json: true },
    });
    const runIds = runs.map((r) => r.id);
    const n = runs.length;

    const results = runIds.length
      ? await prisma.variantResult.findMany({ where: { run_id: { in: runIds } }, select: { status: true } })
      : [];
    const failed = results.filter((r) => r.status !== "healthy").length;

    // Cells voted = rows shipped x fields, summed across runs. Votes are only recorded
    // for contested cells, so the ratio of the two is the dispute rate.
    const schema = JSON.parse(t.schema_json) as TargetSchema;
    const fieldCount = Object.keys(schema.fields).length || 1;
    const cellsVoted = runs.reduce((sum, r) => {
      const consensusRows = r.consensus_json ? (JSON.parse(r.consensus_json) as Row[]).length : 0;
      return sum + consensusRows * fieldCount;
    }, 0);
    const disputed = runIds.length ? await prisma.vote.count({ where: { run_id: { in: runIds } } }) : 0;

    const heals = await prisma.healEvent.findMany({
      where: { variant: { target_id: t.id } },
      select: { verdict: true, verification: true, started_at: true, decided_at: true },
    });
    const approved = heals.filter((h) => h.verdict === "approved");

    const alerts = await prisma.driftAlert.findMany({
      where: { target_id: t.id },
      select: { fleet_wide: true },
    });

    const parts: VolatilityParts = {
      breakageRate: results.length ? failed / results.length : 0,
      disputeRate: cellsVoted ? disputed / cellsVoted : 0,
      driftPerRun: n ? alerts.length / n : 0,
      healsPerRun: n ? heals.length / n : 0,
    };

    rows.push({
      ...parts,
      name: t.name,
      url: t.url,
      itemLabel: schema.itemLabel ?? "row",
      runs: n,
      score: volatilityScore(parts),
      mttdMs: mean(
        runs
          .filter((r) => r.finished_at)
          .map((r) => r.finished_at!.getTime() - r.started_at.getTime())
          .filter((ms) => ms > 0)
      ),
      mtthMs: mean(
        approved
          .filter((h) => h.decided_at)
          .map((h) => h.decided_at!.getTime() - h.started_at.getTime())
          .filter((ms) => ms > 0)
      ),
      // Verification lag needs the run that proved it; approximated by the gap between
      // the decision and the next finished run, which is when verification happens.
      mttvMs: mean(
        approved
          .filter((h) => h.decided_at)
          .map((h) => {
            const next = runs.find((r) => r.finished_at && r.finished_at > h.decided_at!);
            return next ? next.finished_at!.getTime() - h.decided_at!.getTime() : NaN;
          })
          .filter((ms) => Number.isFinite(ms) && ms > 0)
      ),
      healApproved: approved.length,
      healRejected: heals.filter((h) => h.verdict === "rejected").length,
      healVerified: heals.filter((h) => h.verification === "verified").length,
      healRegressed: heals.filter((h) => h.verification === "regressed").length,
      silentDrift: alerts.filter((a) => a.fleet_wide).length,
      cellsVoted,
      badReadingsBlocked: disputed,
    });
  }

  const sum = (f: (r: TargetVolatility) => number) => rows.reduce((a, r) => a + f(r), 0);
  const totals: BugleTotals = {
    targets: rows.length,
    runs: sum((r) => r.runs),
    scrapers: await prisma.variant.count({ where: { status: "active" } }),
    cellsVoted: sum((r) => r.cellsVoted),
    badReadingsBlocked: sum((r) => r.badReadingsBlocked),
    healsProposed: sum((r) => r.healApproved + r.healRejected),
    healApproved: sum((r) => r.healApproved),
    healRejected: sum((r) => r.healRejected),
    healVerified: sum((r) => r.healVerified),
    healRegressed: sum((r) => r.healRegressed),
    silentDrift: sum((r) => r.silentDrift),
    driftSignals: await prisma.driftAlert.count(),
  };

  return { targets: rows.sort((a, b) => b.score - a.score || b.runs - a.runs), totals };
}
