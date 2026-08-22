import Database from "better-sqlite3";
import { join } from "node:path";
import { REPO_ROOT } from "./env.js";
import type { TargetSchema, VariantStrategy } from "./types.js";

const db = new Database(join(REPO_ROOT, "silk.db"));
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS targets (
  id INTEGER PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  url TEXT NOT NULL,
  schema_json TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS variants (
  id INTEGER PRIMARY KEY,
  target_id INTEGER NOT NULL REFERENCES targets(id),
  collector_id TEXT NOT NULL,
  strategy TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY,
  target_id INTEGER NOT NULL REFERENCES targets(id),
  started_at TEXT NOT NULL,
  finished_at TEXT,
  consensus_json TEXT
);
CREATE TABLE IF NOT EXISTS variant_results (
  id INTEGER PRIMARY KEY,
  run_id INTEGER NOT NULL REFERENCES runs(id),
  variant_id INTEGER NOT NULL REFERENCES variants(id),
  status TEXT NOT NULL,
  rows_json TEXT,
  error TEXT,
  dissents_json TEXT
);
CREATE TABLE IF NOT EXISTS votes (
  id INTEGER PRIMARY KEY,
  run_id INTEGER NOT NULL REFERENCES runs(id),
  row_key TEXT NOT NULL,
  field TEXT NOT NULL,
  consensus_value TEXT,
  dissenting_json TEXT
);
CREATE TABLE IF NOT EXISTS heal_events (
  id INTEGER PRIMARY KEY,
  variant_id INTEGER NOT NULL REFERENCES variants(id),
  trigger_run_id INTEGER REFERENCES runs(id),
  prompt TEXT NOT NULL,
  preview_json TEXT,
  verdict TEXT,            -- approved | rejected | needs_human | pending
  verdict_reason TEXT,
  started_at TEXT DEFAULT (datetime('now')),
  decided_at TEXT
);
`);

export interface TargetRecord {
  id: number;
  name: string;
  url: string;
  schema: TargetSchema;
}

export interface VariantRecord {
  id: number;
  target_id: number;
  collector_id: string;
  strategy: VariantStrategy;
  status: string;
}

export function upsertTarget(name: string, url: string, schema: TargetSchema): TargetRecord {
  db.prepare(
    `INSERT INTO targets (name, url, schema_json) VALUES (?, ?, ?)
     ON CONFLICT(name) DO UPDATE SET url = excluded.url, schema_json = excluded.schema_json`
  ).run(name, url, JSON.stringify(schema));
  return getTarget(name)!;
}

export function getTarget(name: string): TargetRecord | undefined {
  const r = db.prepare(`SELECT * FROM targets WHERE name = ?`).get(name) as
    | { id: number; name: string; url: string; schema_json: string }
    | undefined;
  return r ? { id: r.id, name: r.name, url: r.url, schema: JSON.parse(r.schema_json) } : undefined;
}

export function addVariant(targetId: number, collectorId: string, strategy: VariantStrategy): void {
  db.prepare(`INSERT INTO variants (target_id, collector_id, strategy) VALUES (?, ?, ?)`).run(
    targetId,
    collectorId,
    strategy
  );
}

/**
 * Retires a target's current variants so a rebuilt Flock replaces them.
 * Rows are kept, not deleted — past runs and heal history must stay readable.
 */
export function retireVariants(targetId: number): number {
  return db
    .prepare(`UPDATE variants SET status = 'retired' WHERE target_id = ? AND status = 'active'`)
    .run(targetId).changes;
}

export function getVariants(targetId: number): VariantRecord[] {
  return db
    .prepare(`SELECT * FROM variants WHERE target_id = ? AND status = 'active'`)
    .all(targetId) as VariantRecord[];
}

export function startRun(targetId: number): number {
  const r = db
    .prepare(`INSERT INTO runs (target_id, started_at) VALUES (?, datetime('now'))`)
    .run(targetId);
  return Number(r.lastInsertRowid);
}

export function finishRun(runId: number, consensusRows: unknown[]): void {
  db.prepare(`UPDATE runs SET finished_at = datetime('now'), consensus_json = ? WHERE id = ?`).run(
    JSON.stringify(consensusRows),
    runId
  );
}

export function recordVariantResult(
  runId: number,
  variantId: number,
  status: string,
  rows: unknown[],
  error: string | undefined,
  dissents: string[]
): void {
  db.prepare(
    `INSERT INTO variant_results (run_id, variant_id, status, rows_json, error, dissents_json)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(runId, variantId, status, JSON.stringify(rows), error ?? null, JSON.stringify(dissents));
}

export function recordVote(
  runId: number,
  rowKey: string,
  field: string,
  consensusValue: unknown,
  dissenting: unknown[]
): void {
  db.prepare(
    `INSERT INTO votes (run_id, row_key, field, consensus_value, dissenting_json) VALUES (?, ?, ?, ?, ?)`
  ).run(runId, rowKey, field, JSON.stringify(consensusValue ?? null), JSON.stringify(dissenting));
}

export function startHealEvent(variantId: number, triggerRunId: number, prompt: string): number {
  const r = db
    .prepare(
      `INSERT INTO heal_events (variant_id, trigger_run_id, prompt, verdict) VALUES (?, ?, ?, 'pending')`
    )
    .run(variantId, triggerRunId, prompt);
  return Number(r.lastInsertRowid);
}

export function decideHealEvent(
  healId: number,
  verdict: "approved" | "rejected" | "needs_human",
  reason: string,
  preview: unknown[]
): void {
  db.prepare(
    `UPDATE heal_events SET verdict = ?, verdict_reason = ?, preview_json = ?, decided_at = datetime('now') WHERE id = ?`
  ).run(verdict, reason, JSON.stringify(preview), healId);
}

export function lastRuns(targetId: number, limit = 10) {
  return db
    .prepare(`SELECT * FROM runs WHERE target_id = ? ORDER BY id DESC LIMIT ?`)
    .all(targetId, limit);
}

export function pendingHeals(): unknown[] {
  return db.prepare(`SELECT * FROM heal_events WHERE verdict = 'pending'`).all();
}

export function allTargets(): TargetRecord[] {
  const rows = db.prepare(`SELECT * FROM targets`).all() as {
    id: number; name: string; url: string; schema_json: string;
  }[];
  return rows.map((r) => ({ id: r.id, name: r.name, url: r.url, schema: JSON.parse(r.schema_json) }));
}

export { db };
