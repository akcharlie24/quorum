import { db } from "./db.ts";
import type { Row, TargetSchema, VariantStrategy } from "./types.ts";

export interface VariantView {
  id: number;
  collector_id: string;
  strategy: VariantStrategy;
  status: string;
  lastRunStatus: string | null;
  dissentCount: number;
  error: string | null;
}

export interface VoteView {
  rowKey: string;
  field: string;
  consensusValue: unknown;
  dissenting: { variantId: number; value: unknown }[];
}

export interface HealView {
  id: number;
  variantId: number;
  strategy: string;
  prompt: string;
  verdict: string;
  verdict_reason: string | null;
  /** null = awaiting a live run, "verified" = proven in production, "regressed" = fix did not hold */
  verification: string | null;
  started_at: string;
  decided_at: string | null;
}

export interface TargetSummary {
  id: number;
  name: string;
  url: string;
  schema: TargetSchema;
  variantCount: number;
  health: "healthy" | "degraded" | "down" | "pending";
  lastRunAt: string | null;
  consensusRows: number;
  runCount: number;
  healApproved: number;
}

export interface TargetDetail extends TargetSummary {
  variants: VariantView[];
  consensus: Row[];
  votes: VoteView[];
  heals: HealView[];
  runId: number | null;
  history: { runId: number; startedAt: string; healthy: number; dissenting: number; broken: number }[];
}

function latestRunId(targetId: number): number | null {
  const r = db
    .prepare(`SELECT id FROM runs WHERE target_id = ? AND finished_at IS NOT NULL ORDER BY id DESC LIMIT 1`)
    .get(targetId) as { id: number } | undefined;
  return r?.id ?? null;
}

export function listTargets(): TargetSummary[] {
  const targets = db.prepare(`SELECT * FROM targets ORDER BY id DESC`).all() as {
    id: number; name: string; url: string; schema_json: string;
  }[];

  return targets.map((t) => {
    const runId = latestRunId(t.id);
    const variantCount = (
      db.prepare(`SELECT COUNT(*) n FROM variants WHERE target_id = ? AND status = 'active'`).get(t.id) as { n: number }
    ).n;
    const runCount = (
      db.prepare(`SELECT COUNT(*) n FROM runs WHERE target_id = ? AND finished_at IS NOT NULL`).get(t.id) as { n: number }
    ).n;
    const healApproved = (
      db.prepare(
        `SELECT COUNT(*) n FROM heal_events h JOIN variants v ON v.id = h.variant_id
         WHERE v.target_id = ? AND h.verdict = 'approved'`
      ).get(t.id) as { n: number }
    ).n;

    let health: TargetSummary["health"] = "pending";
    let consensusRows = 0;
    let lastRunAt: string | null = null;

    if (runId) {
      const run = db.prepare(`SELECT started_at, consensus_json FROM runs WHERE id = ?`).get(runId) as {
        started_at: string; consensus_json: string | null;
      };
      lastRunAt = run.started_at;
      consensusRows = run.consensus_json ? (JSON.parse(run.consensus_json) as Row[]).length : 0;
      const statuses = db
        .prepare(`SELECT status FROM variant_results WHERE run_id = ?`)
        .all(runId) as { status: string }[];
      const broken = statuses.filter((s) => s.status === "broken").length;
      const dissenting = statuses.filter((s) => s.status === "dissenting").length;
      health = consensusRows === 0 || broken >= 2 ? "down" : broken + dissenting > 0 ? "degraded" : "healthy";
    }

    return {
      id: t.id,
      name: t.name,
      url: t.url,
      schema: JSON.parse(t.schema_json),
      variantCount,
      health,
      lastRunAt,
      consensusRows,
      runCount,
      healApproved,
    };
  });
}

export function getTargetDetail(name: string): TargetDetail | undefined {
  const summary = listTargets().find((t) => t.name === name);
  if (!summary) return undefined;

  const runId = latestRunId(summary.id);
  const variantRows = db
    .prepare(`SELECT * FROM variants WHERE target_id = ? AND status = 'active' ORDER BY id`)
    .all(summary.id) as { id: number; collector_id: string; strategy: VariantStrategy; status: string }[];

  const variants: VariantView[] = variantRows.map((v) => {
    const res = runId
      ? (db
          .prepare(`SELECT status, dissents_json, error FROM variant_results WHERE run_id = ? AND variant_id = ?`)
          .get(runId, v.id) as { status: string; dissents_json: string; error: string | null } | undefined)
      : undefined;
    return {
      id: v.id,
      collector_id: v.collector_id,
      strategy: v.strategy,
      status: v.status,
      lastRunStatus: res?.status ?? null,
      dissentCount: res ? (JSON.parse(res.dissents_json) as string[]).length : 0,
      error: res?.error ?? null,
    };
  });

  let consensus: Row[] = [];
  let votes: VoteView[] = [];
  if (runId) {
    const run = db.prepare(`SELECT consensus_json FROM runs WHERE id = ?`).get(runId) as {
      consensus_json: string | null;
    };
    consensus = run.consensus_json ? JSON.parse(run.consensus_json) : [];
    votes = (
      db.prepare(`SELECT row_key, field, consensus_value, dissenting_json FROM votes WHERE run_id = ?`).all(runId) as {
        row_key: string; field: string; consensus_value: string; dissenting_json: string;
      }[]
    ).map((v) => ({
      rowKey: v.row_key,
      field: v.field,
      consensusValue: JSON.parse(v.consensus_value),
      dissenting: JSON.parse(v.dissenting_json),
    }));
  }

  const heals = db
    .prepare(
      `SELECT h.id, h.variant_id as variantId, v.strategy, h.prompt, h.verdict, h.verdict_reason, h.verification, h.started_at, h.decided_at
       FROM heal_events h JOIN variants v ON v.id = h.variant_id
       WHERE v.target_id = ? ORDER BY h.id DESC LIMIT 20`
    )
    .all(summary.id) as HealView[];

  const history = (
    db
      .prepare(`SELECT id, started_at FROM runs WHERE target_id = ? AND finished_at IS NOT NULL ORDER BY id DESC LIMIT 12`)
      .all(summary.id) as { id: number; started_at: string }[]
  )
    .reverse()
    .map((r) => {
      const statuses = db.prepare(`SELECT status FROM variant_results WHERE run_id = ?`).all(r.id) as {
        status: string;
      }[];
      return {
        runId: r.id,
        startedAt: r.started_at,
        healthy: statuses.filter((s) => s.status === "healthy").length,
        dissenting: statuses.filter((s) => s.status === "dissenting").length,
        broken: statuses.filter((s) => s.status === "broken").length,
      };
    });

  return { ...summary, variants, consensus, votes, heals, runId, history };
}
