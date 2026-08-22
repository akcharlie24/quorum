import pc from "picocolors";
import { classifyError, isInfrastructureFailure, runScraper } from "./brightdata.js";
import {
  finishRun,
  getVariants,
  recordVariantResult,
  recordVote,
  setHealVerification,
  startRun,
  unverifiedHeals,
  type TargetRecord,
} from "./db.ts";
import { consensus, normalizeRows } from "./consensus.ts";
import { healAndDecide } from "./healer.ts";
import type { ConsensusResult } from "./types.ts";

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
        if (!raw.ok) {
          // Keep the CLI's own words alongside our category — the category alone is
          // useless when diagnosing a live target.
          const detail = (raw.stderr || raw.stdout)
            .replace(/^.*Polling[^\n]*\n?/gm, "")
            .replace(/^\s*Step:[^\n]*\n?/gm, "")
            .trim();
          return {
            variant: v,
            rows: [],
            error: `${classifyError(raw)}: ${detail.slice(-400) || `exit ${raw.exitCode}`}`,
          };
        }
        if (rows.length === 0) {
          return { variant: v, rows: [], error: "empty: scraper returned no rows" };
        }
        const normalized = normalizeRows(rows, target.schema);
        if (normalized.length === 0) {
          // Data came back but none of it matched the schema — a shape mismatch, not a
          // dead scraper. Keep a sample so the cause is visible instead of silent.
          return {
            variant: v,
            rows: [],
            error: `schema-mismatch: ${rows.length} raw row(s), no schema fields found. Sample: ${JSON.stringify(rows[0]).slice(0, 300)}`,
          };
        }
        return { variant: v, rows: normalized, error: undefined };
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

  // An approved fix is only provisional. Bright Data's preview can look perfect while
  // the deployed scraper still fails, so every approval must survive a real run.
  for (const heal of unverifiedHeals(target.id)) {
    const verdict = res.verdicts.find((v) => v.variantId === heal.variant_id);
    if (!verdict || isInfrastructureFailure(verdict.error)) continue;
    const strategy = variants.find((x) => x.id === heal.variant_id)?.strategy ?? String(heal.variant_id);
    if (verdict.status === "healthy") {
      setHealVerification(heal.id, "verified", `confirmed healthy on run #${runId}`);
      log(pc.green(`  ✔ heal VERIFIED in production — ${strategy} healthy on run #${runId}`));
    } else {
      setHealVerification(heal.id, "regressed", `still ${verdict.status} on run #${runId}`);
      log(pc.red(`  ✘ heal FAILED verification — ${strategy} still ${verdict.status} despite an approved fix`));
    }
  }

  // Heal every variant that lost the vote (serialize: BD rate-caps heals).
  let healed = 0;
  if (opts.heal) {
    for (const v of res.verdicts) {
      if (v.status === "healthy") continue;
      if (isInfrastructureFailure(v.error)) {
        log(pc.dim(`  ↷ ${variants.find((x) => x.id === v.variantId)!.strategy}: our connection failed, not the scraper — no heal`));
        continue;
      }
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
