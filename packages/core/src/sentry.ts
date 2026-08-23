import pc from "picocolors";
import { alertKey, detectDrift, diffAlerts, fingerprint, isFleetWide, type DriftAlert } from "./drift.ts";
import { prisma } from "./prisma.ts";
import type { TargetRecord } from "./db.ts";
import type { Row } from "./types.ts";

/**
 * Spider-Sense — the persistence and orchestration half of drift detection.
 *
 * `drift.ts` stays pure statistics; everything that touches the database lives here, so
 * the detection rules can be tested without a Postgres instance.
 */

/** How many previous runs form the baseline. Long enough to have a shape, short enough to follow a site that genuinely moves. */
const BASELINE_RUNS = 6;

/** Rebuilds per-run fingerprints from the consensus datasets we already store. */
async function history(targetId: number, beforeRunId: number, schema: TargetRecord["schema"]) {
  const runs = await prisma.run.findMany({
    where: { target_id: targetId, finished_at: { not: null }, id: { lt: beforeRunId } },
    orderBy: { id: "desc" },
    take: BASELINE_RUNS,
    select: { consensus_json: true },
  });
  return runs
    .map((r) => (r.consensus_json ? (JSON.parse(r.consensus_json) as Row[]) : []))
    .filter((rows) => rows.length > 0)
    .map((rows) => fingerprint(rows, schema));
}

function icon(severity: string): string {
  return severity === "critical" ? pc.red("◆") : severity === "warn" ? pc.yellow("◈") : pc.dim("◇");
}

/**
 * Compares this run against the target's own recent history and records what changed.
 *
 * Deliberately swallows its own failures: drift detection is a second opinion, and a
 * second opinion that can fail the run it is commenting on is worse than none.
 */
export async function runSentry(
  target: TargetRecord,
  runId: number,
  rows: Row[],
  variantStatuses: string[],
  log: (msg: string) => void = console.log
): Promise<DriftAlert[]> {
  try {
    const past = await history(target.id, runId, target.schema);
    if (past.length < 2) {
      log(pc.dim(`  spider-sense: ${past.length} prior run(s) — not enough history to judge drift yet`));
      return [];
    }

    const fired = detectDrift(fingerprint(rows, target.schema), past);
    // Every variant healthy means they all moved together: the site changed, or they are
    // all wrong in the same way. Either way the vote had nothing to compare and saw nothing.
    const fleetWide = isFleetWide(variantStatuses);

    const open = await prisma.driftAlert.findMany({
      where: { target_id: target.id, resolved_at: null },
      select: { id: true, field: true, kind: true },
    });
    const openKeys = open.map((o) => alertKey({ field: o.field, kind: o.kind as DriftAlert["kind"] }));
    const { opened, resolvedKeys } = diffAlerts(openKeys, fired);

    for (const a of opened) {
      await prisma.driftAlert.create({
        data: {
          target_id: target.id,
          run_id: runId,
          field: a.field,
          kind: a.kind,
          severity: a.severity,
          detail: a.detail,
          baseline: a.baseline,
          current: a.current,
          fleet_wide: fleetWide,
        },
      });
      log(`  ${icon(a.severity)} spider-sense: ${a.field ?? "dataset"} — ${a.detail}`);
      if (fleetWide) {
        log(
          pc.red(
            `     all ${variantStatuses.length} scrapers agreed on this — the vote could not have caught it`
          )
        );
      }
    }

    if (resolvedKeys.length > 0) {
      const ids = open
        .filter((o) => resolvedKeys.includes(alertKey({ field: o.field, kind: o.kind as DriftAlert["kind"] })))
        .map((o) => o.id);
      await prisma.driftAlert.updateMany({ where: { id: { in: ids } }, data: { resolved_at: new Date() } });
      log(pc.green(`  ✔ spider-sense: ${ids.length} earlier signal(s) cleared`));
    }

    if (fired.length === 0 && resolvedKeys.length === 0) {
      log(pc.dim(`  spider-sense: no drift against the last ${past.length} runs`));
    }

    return fired;
  } catch (e) {
    log(pc.dim(`  spider-sense unavailable: ${String(e).slice(0, 160)}`));
    return [];
  }
}

/** Replays the sentry over a target's whole run history. Used by scripts/backfill-drift.ts. */
export async function backfillTarget(target: TargetRecord, reset = false, log: (m: string) => void = console.log) {
  if (reset) await prisma.driftAlert.deleteMany({ where: { target_id: target.id } });
  const runs = await prisma.run.findMany({
    where: { target_id: target.id, finished_at: { not: null } },
    orderBy: { id: "asc" },
    select: { id: true, consensus_json: true },
  });
  let total = 0;
  for (const r of runs) {
    const rows = r.consensus_json ? (JSON.parse(r.consensus_json) as Row[]) : [];
    const statuses = (
      await prisma.variantResult.findMany({ where: { run_id: r.id }, select: { status: true } })
    ).map((s) => s.status);
    const fired = await runSentry(target, r.id, rows, statuses, () => {});
    total += fired.length;
  }
  log(`  ${target.name}: replayed ${runs.length} run(s), ${total} signal(s) seen`);
}
