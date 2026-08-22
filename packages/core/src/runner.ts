import pc from "picocolors";
import { classifyError, runScraper } from "./brightdata.js";
import {
  finishRun,
  getVariants,
  recordVariantResult,
  recordVote,
  startRun,
  type TargetRecord,
} from "./db.js";
import { consensus, normalizeRows } from "./consensus.js";
import { healAndDecide } from "./healer.js";
import type { ConsensusResult } from "./types.js";

const STATUS_ICON = { healthy: pc.green("●"), dissenting: pc.yellow("◐"), broken: pc.red("○") };

export interface CycleResult {
  runId: number;
  consensus: ConsensusResult;
  healed: number;
}

/** One SILK cycle: run all variants -> vote -> record -> heal losers. */
export async function runCycle(
  target: TargetRecord,
  opts: { heal?: boolean } = { heal: true },
  log: (msg: string) => void = console.log
): Promise<CycleResult> {
  const variants = getVariants(target.id);
  if (variants.length === 0) throw new Error(`target "${target.name}" has no variants — run silk flock first`);

  const runId = startRun(target.id);
  log(pc.bold(`\n🕷  run #${runId} · ${target.name} · ${variants.length} variants`));

  const results = await Promise.all(
    variants.map(async (v) => {
      try {
        const { rows, raw } = await runScraper(v.collector_id, target.url);
        if (!raw.ok) return { variant: v, rows: [], error: classifyError(raw) as string };
        return { variant: v, rows: normalizeRows(rows, target.schema), error: undefined };
      } catch (e) {
        return { variant: v, rows: [], error: String(e).slice(0, 500) };
      }
    })
  );

  const res = consensus(
    results.map((r) => ({ variantId: r.variant.id, rows: r.rows, error: r.error })),
    target.schema
  );

  for (const v of res.verdicts) {
    const variant = variants.find((x) => x.id === v.variantId)!;
    recordVariantResult(runId, v.variantId, v.status, v.rows, v.error, v.dissents);
    log(
      `  ${STATUS_ICON[v.status]} ${variant.strategy.padEnd(12)} ${v.status}` +
        (v.dissents.length ? pc.dim(` (outvoted on ${v.dissents.length} cells)`) : "") +
        (v.error ? pc.dim(` (${v.error.slice(0, 80)})`) : "")
    );
  }
  for (const vote of res.votes) {
    recordVote(runId, vote.rowKey, vote.field, vote.consensusValue, vote.dissenting);
  }
  finishRun(runId, res.rows);
  log(pc.dim(`  consensus dataset: ${res.rows.length} rows — pipeline output is clean`));

  // Heal every variant that lost the vote (serialize: BD rate-caps heals).
  let healed = 0;
  if (opts.heal) {
    for (const v of res.verdicts) {
      if (v.status === "healthy") continue;
      if (res.rows.length === 0) {
        log(pc.red("  no consensus available (too many variants down) — skipping heal, needs_human"));
        break;
      }
      const variant = variants.find((x) => x.id === v.variantId)!;
      const outcome = await healAndDecide(variant, v, res.rows, target, runId, log);
      if (outcome.verdict === "approved") healed++;
    }
  }

  return { runId, consensus: res, healed };
}
