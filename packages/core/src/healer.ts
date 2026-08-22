import pc from "picocolors";
import { approveHeal, healScraper } from "./brightdata.js";
import { decideHealEvent, startHealEvent, type TargetRecord, type VariantRecord } from "./db.js";
import { consensus, normalizeRows } from "./consensus.js";
import type { Row, VariantRunResult } from "./types.js";

const APPROVE_THRESHOLD = 0.9;

/** Build a heal prompt from the consensus diff — concrete field names + expected examples. */
export function composeHealPrompt(
  verdict: VariantRunResult,
  consensusRows: Row[],
  target: TargetRecord
): string {
  const fields = Object.keys(target.schema.fields);
  const example = consensusRows[0] ?? {};
  const exampleStr = fields.map((f) => `${f}=${JSON.stringify(example[f])}`).join(", ");

  if (verdict.status === "broken") {
    return (
      `The scraper stopped returning correct data for ${target.url}. ` +
      `It must return one item per product card with fields: ${fields.join(", ")}. ` +
      `Example of a correct item currently on the page: ${exampleStr}. ` +
      `The page layout may have changed (renamed CSS classes or restructured markup); ` +
      `update the extraction logic accordingly. Keep the exact same output field names.`
    );
  }
  const badFields = [...new Set(verdict.dissents.map((d) => d.split(".").pop()))];
  return (
    `The scraper returns wrong values for field(s) ${badFields.join(", ")} on ${target.url}. ` +
    `Correct example item: ${exampleStr}. ` +
    `Fix extraction for those fields; keep the same output field names and all other fields unchanged.`
  );
}

/** Fraction of (row, field) cells in preview that match consensus. */
export function previewMatchScore(preview: unknown[], consensusRows: Row[], target: TargetRecord): number {
  const normalized = normalizeRows(preview, target.schema);
  if (normalized.length === 0) return 0;
  // Reuse the vote machinery: treat consensus as 2 virtual agreeing variants, preview as 1.
  // Preview cell "matches" when it does not dissent.
  const res = consensus(
    [
      { variantId: -1, rows: consensusRows },
      { variantId: -2, rows: consensusRows },
      { variantId: 1, rows: normalized },
    ],
    target.schema
  );
  const previewVerdict = res.verdicts.find((v) => v.variantId === 1)!;
  const totalCells = res.rows.length * Object.keys(target.schema.fields).length || 1;
  const missingRows = Math.max(0, consensusRows.length - normalized.length);
  const missingCells = missingRows * Object.keys(target.schema.fields).length;
  return Math.max(0, 1 - (previewVerdict.dissents.length + missingCells) / totalCells);
}

export interface HealOutcome {
  variantId: number;
  verdict: "approved" | "rejected" | "needs_human";
  score: number;
  healEventId: number;
}

/**
 * The core SILK mechanic: heal -> compare preview to Flock consensus -> approve/reject
 * programmatically. One retry with a sharper prompt on rejection.
 */
export async function healAndDecide(
  variant: VariantRecord,
  verdict: VariantRunResult,
  consensusRows: Row[],
  target: TargetRecord,
  triggerRunId: number,
  log: (msg: string) => void = console.log
): Promise<HealOutcome> {
  let prompt = composeHealPrompt(verdict, consensusRows, target);

  for (let attempt = 1; attempt <= 2; attempt++) {
    const healId = startHealEvent(variant.id, triggerRunId, prompt);
    log(pc.yellow(`  ⚕ heal attempt ${attempt} for variant ${variant.strategy} (${variant.collector_id})`));

    const heal = await healScraper(variant.collector_id, prompt);
    const score = previewMatchScore(heal.preview, consensusRows, target);
    log(pc.dim(`    heal status=${heal.status} previewRows=${heal.preview.length} matchScore=${(score * 100).toFixed(1)}%`));

    if (heal.preview.length > 0 && score >= APPROVE_THRESHOLD) {
      const res = await approveHeal(variant.collector_id);
      const ok = res.ok;
      decideHealEvent(healId, ok ? "approved" : "needs_human",
        ok ? `preview matched consensus at ${(score * 100).toFixed(1)}%` : `approve command failed: ${res.stderr.slice(0, 300)}`,
        heal.preview);
      if (ok) {
        log(pc.green(`    ✔ fix APPROVED by consensus (${(score * 100).toFixed(1)}% match) — no human involved`));
        return { variantId: variant.id, verdict: "approved", score, healEventId: healId };
      }
      return { variantId: variant.id, verdict: "needs_human", score, healEventId: healId };
    }

    // Preview doesn't match consensus (or empty) -> reject the fix.
    await approveHeal(variant.collector_id, { reject: true });
    decideHealEvent(healId, "rejected",
      `preview matched consensus at only ${(score * 100).toFixed(1)}% (< ${APPROVE_THRESHOLD * 100}%)`,
      heal.preview);
    log(pc.red(`    ✘ fix REJECTED by consensus (${(score * 100).toFixed(1)}% match)`));

    // Sharpen the prompt for the retry with explicit expected data.
    const sample = consensusRows.slice(0, 3);
    prompt =
      composeHealPrompt(verdict, consensusRows, target) +
      ` The previous fix was wrong. The correct current data for the first items is exactly: ` +
      JSON.stringify(sample) +
      `. Return items matching this shape and these values.`;
  }

  return { variantId: variant.id, verdict: "needs_human", score: 0, healEventId: -1 };
}
