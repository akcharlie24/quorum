import pc from "picocolors";
import { approveHeal, healScraper, sanitizePrompt } from "./brightdata.js";
import { decideHealEvent, startHealEvent, type TargetRecord, type VariantRecord } from "./db.js";
import { normalizeRows, rowKeyOf, valuesEqual } from "./consensus.js";
import type { Row, VariantRunResult } from "./types.js";

const APPROVE_THRESHOLD = 0.9;
/** A healed scraper must claim at least this share of the consensus row count. */
const CARDINALITY_FLOOR = 0.5;

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

export interface PreviewScore {
  /** Fraction of visible preview cells that match consensus. */
  precision: number;
  /** Rows the preview actually showed. */
  sampleRows: number;
  /** Visible rows + rows the preview said it omitted. */
  claimedRows: number;
}

/**
 * Scores a heal preview against consensus.
 *
 * Bright Data truncates previews ("223 more items"), so comparing row counts directly
 * would fail every fix. We score *precision* over the rows we can see, and check the
 * claimed cardinality separately — a fix that is accurate on its sample and claims a
 * plausible total is a good fix.
 */
export function scorePreview(
  preview: unknown[],
  consensusRows: Row[],
  target: TargetRecord,
  truncatedCount = 0
): PreviewScore {
  const normalized = normalizeRows(preview, target.schema);
  if (normalized.length === 0) return { precision: 0, sampleRows: 0, claimedRows: truncatedCount };

  const fields = Object.entries(target.schema.fields);
  const byKey = new Map(consensusRows.map((r) => [rowKeyOf(r, target.schema), r]));

  let matched = 0;
  for (const row of normalized) {
    const truth = byKey.get(rowKeyOf(row, target.schema));
    if (!truth) continue; // unknown row: every field counts as a miss
    for (const [field, type] of fields) {
      if (valuesEqual(row[field], truth[field], type)) matched++;
    }
  }

  return {
    precision: matched / (normalized.length * fields.length),
    sampleRows: normalized.length,
    claimedRows: normalized.length + truncatedCount,
  };
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

    const heal = await healScraper(variant.collector_id, sanitizePrompt(prompt));
    const s = scorePreview(heal.preview, consensusRows, target, heal.truncatedCount);
    const pct = (s.precision * 100).toFixed(1);
    // A truncated preview must still claim enough rows to be a plausible fix.
    const enoughRows = s.claimedRows >= Math.max(1, consensusRows.length * CARDINALITY_FLOOR);
    log(
      pc.dim(
        `    heal status=${heal.status} sample=${s.sampleRows} claimed=${s.claimedRows}/${consensusRows.length} precision=${pct}%`
      )
    );

    if (s.sampleRows > 0 && s.precision >= APPROVE_THRESHOLD && enoughRows) {
      const res = await approveHeal(variant.collector_id);
      const ok = res.ok;
      decideHealEvent(
        healId,
        ok ? "approved" : "needs_human",
        ok
          ? `preview matched consensus at ${pct}% across ${s.sampleRows} sampled rows (claims ${s.claimedRows})`
          : `approve command failed: ${res.stderr.slice(0, 300)}`,
        heal.preview
      );
      if (ok) {
        log(pc.green(`    ✔ fix APPROVED by consensus (${pct}% precision) — no human involved`));
        return { variantId: variant.id, verdict: "approved", score: s.precision, healEventId: healId };
      }
      return { variantId: variant.id, verdict: "needs_human", score: s.precision, healEventId: healId };
    }

    // Preview is wrong, empty, or too small to be the whole listing -> reject the fix.
    const why =
      s.sampleRows === 0
        ? "preview contained no usable rows"
        : !enoughRows
          ? `preview claims only ${s.claimedRows} of ~${consensusRows.length} rows`
          : `preview matched consensus at only ${pct}% (< ${APPROVE_THRESHOLD * 100}%)`;
    await approveHeal(variant.collector_id, { reject: true });
    decideHealEvent(healId, "rejected", why, heal.preview);
    log(pc.red(`    ✘ fix REJECTED by consensus — ${why}`));

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
