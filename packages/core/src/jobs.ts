import { db } from "./db.js";

export type JobKind = "flock" | "run";
export type JobStatus = "running" | "done" | "error";

db.exec(`
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,
  target_name TEXT NOT NULL,
  status TEXT NOT NULL,
  log_json TEXT NOT NULL DEFAULT '[]',
  error TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  finished_at TEXT
);
`);

export interface JobRecord {
  id: number;
  kind: JobKind;
  target_name: string;
  status: JobStatus;
  log: string[];
  error: string | null;
  created_at: string;
  finished_at: string | null;
}

export function createJob(kind: JobKind, targetName: string): number {
  const r = db
    .prepare(`INSERT INTO jobs (kind, target_name, status) VALUES (?, ?, 'running')`)
    .run(kind, targetName);
  return Number(r.lastInsertRowid);
}

/** Strips ANSI colour codes so terminal-formatted log lines render cleanly in the browser. */
export function appendJobLog(jobId: number, line: string): void {
  const clean = line.replace(/\[[0-9;]*m/g, "");
  const row = db.prepare(`SELECT log_json FROM jobs WHERE id = ?`).get(jobId) as
    | { log_json: string }
    | undefined;
  if (!row) return;
  const log = JSON.parse(row.log_json) as string[];
  log.push(clean);
  db.prepare(`UPDATE jobs SET log_json = ? WHERE id = ?`).run(JSON.stringify(log), jobId);
}

export function finishJob(jobId: number, status: JobStatus, error?: string): void {
  db.prepare(`UPDATE jobs SET status = ?, error = ?, finished_at = datetime('now') WHERE id = ?`).run(
    status,
    error ?? null,
    jobId
  );
}

export function getJob(jobId: number): JobRecord | undefined {
  const r = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(jobId) as
    | (Omit<JobRecord, "log"> & { log_json: string })
    | undefined;
  return r ? { ...r, log: JSON.parse(r.log_json) } : undefined;
}

export function activeJobs(): JobRecord[] {
  const rows = db
    .prepare(`SELECT * FROM jobs WHERE status = 'running' ORDER BY id DESC`)
    .all() as (Omit<JobRecord, "log"> & { log_json: string })[];
  return rows.map((r) => ({ ...r, log: JSON.parse(r.log_json) }));
}

export function recentJobs(targetName?: string, limit = 20): JobRecord[] {
  const rows = (
    targetName
      ? db.prepare(`SELECT * FROM jobs WHERE target_name = ? ORDER BY id DESC LIMIT ?`).all(targetName, limit)
      : db.prepare(`SELECT * FROM jobs ORDER BY id DESC LIMIT ?`).all(limit)
  ) as (Omit<JobRecord, "log"> & { log_json: string })[];
  return rows.map((r) => ({ ...r, log: JSON.parse(r.log_json) }));
}

/** Marks jobs left "running" by a server restart as failed, so the UI never hangs on a ghost. */
export function reapStaleJobs(): void {
  db.prepare(
    `UPDATE jobs SET status = 'error', error = 'interrupted (server restarted)', finished_at = datetime('now')
     WHERE status = 'running' AND created_at < datetime('now', '-45 minutes')`
  ).run();
}
