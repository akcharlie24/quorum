import type { Row, TargetSchema } from "./types.ts";

/**
 * Spider-Sense: statistical drift detection over run history.
 *
 * Consensus catches scrapers that DISAGREE. It is structurally blind to scrapers that
 * are unanimously wrong — if a site starts serving $0 and all three variants faithfully
 * report $0, the vote is perfectly happy and the pipeline ships garbage. Drift compares
 * this run against the target's own recent history instead of against its peers, which
 * is the only way to catch a fleet-wide failure.
 */

export type DriftKind =
  | "row_count_drop"
  | "null_spike"
  | "value_collapse"
  | "distribution_shift"
  | "field_vanished";

export type DriftSeverity = "info" | "warn" | "critical";

export interface DriftAlert {
  field: string | null; // null = whole-dataset signal
  kind: DriftKind;
  severity: DriftSeverity;
  detail: string;
  baseline: number | null;
  current: number | null;
}

export interface FieldFingerprint {
  field: string;
  nullRate: number;
  distinct: number;
  mean: number | null; // numeric fields only
  stddev: number | null;
}

export interface RunFingerprint {
  rowCount: number;
  fields: FieldFingerprint[];
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function stddev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

/** Summarises one run's consensus dataset into comparable per-field statistics. */
export function fingerprint(rows: Row[], schema: TargetSchema): RunFingerprint {
  const fields = Object.entries(schema.fields).map(([field, type]) => {
    const values = rows.map((r) => r[field]);
    const present = values.filter((v) => v !== null && v !== undefined && v !== "");
    const numeric = type === "string" ? [] : present.map(Number).filter((n) => !Number.isNaN(n));
    return {
      field,
      nullRate: rows.length ? 1 - present.length / rows.length : 1,
      distinct: new Set(present.map((v) => String(v))).size,
      mean: numeric.length ? mean(numeric) : null,
      stddev: numeric.length ? stddev(numeric) : null,
    };
  });
  return { rowCount: rows.length, fields };
}

const ROW_DROP_RATIO = 0.5; // losing half the rows is a breakage, not a slow news day
const NULL_SPIKE = 0.3; // absolute jump in null rate
const SHIFT_SIGMAS = 3; // how far a mean may wander before it is suspicious

/**
 * Compares the current run against a baseline built from previous runs.
 * Returns an empty list when there is too little history to judge.
 */
export function detectDrift(
  current: RunFingerprint,
  history: RunFingerprint[],
  minHistory = 2
): DriftAlert[] {
  if (history.length < minHistory) return [];
  const alerts: DriftAlert[] = [];

  const baseRows = mean(history.map((h) => h.rowCount));
  if (baseRows > 0 && current.rowCount < baseRows * ROW_DROP_RATIO) {
    alerts.push({
      field: null,
      kind: "row_count_drop",
      severity: current.rowCount === 0 ? "critical" : "warn",
      detail: `row count fell to ${current.rowCount} from a typical ${baseRows.toFixed(0)}`,
      baseline: baseRows,
      current: current.rowCount,
    });
  }

  for (const f of current.fields) {
    const past = history.flatMap((h) => h.fields.filter((x) => x.field === f.field));
    if (past.length === 0) continue;

    const baseNull = mean(past.map((p) => p.nullRate));
    if (f.nullRate - baseNull > NULL_SPIKE) {
      alerts.push({
        field: f.field,
        kind: f.nullRate >= 0.99 ? "field_vanished" : "null_spike",
        severity: f.nullRate >= 0.99 ? "critical" : "warn",
        detail:
          f.nullRate >= 0.99
            ? `every value is now empty (was ${(baseNull * 100).toFixed(0)}% empty)`
            : `empty values rose to ${(f.nullRate * 100).toFixed(0)}% from ${(baseNull * 100).toFixed(0)}%`,
        baseline: baseNull,
        current: f.nullRate,
      });
      continue;
    }

    // The signature of silent corruption: a field that used to vary is now one value.
    const baseSpread = mean(past.map((p) => p.stddev ?? 0));
    if (f.stddev !== null && baseSpread > 0 && f.stddev === 0 && f.distinct <= 1) {
      alerts.push({
        field: f.field,
        kind: "value_collapse",
        severity: "critical",
        detail: `every row now reports the same ${f.field} (${f.mean}); it used to vary`,
        baseline: baseSpread,
        current: 0,
      });
      continue;
    }

    const baseMean = mean(past.map((p) => p.mean ?? 0));
    const baseStd = mean(past.map((p) => p.stddev ?? 0));
    if (f.mean !== null && baseStd > 0 && Math.abs(f.mean - baseMean) > SHIFT_SIGMAS * baseStd) {
      alerts.push({
        field: f.field,
        kind: "distribution_shift",
        severity: "warn",
        detail: `average ${f.field} moved to ${f.mean.toFixed(2)} from ${baseMean.toFixed(2)}`,
        baseline: baseMean,
        current: f.mean,
      });
    }
  }

  return alerts;
}

/**
 * Distinguishes a broken scraper from a changed world.
 * If every variant moved together the site changed; if one moved alone it is a fault.
 */
export function isFleetWide(variantStatuses: string[]): boolean {
  return variantStatuses.length > 0 && variantStatuses.every((s) => s === "healthy");
}
