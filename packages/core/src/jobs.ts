import { invalidate } from "./cache.ts";
import { prisma } from "./prisma.ts";

export type JobKind = "flock" | "run";
export type JobStatus = "running" | "done" | "error";

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

type JobRow = {
  id: number;
  kind: string;
  target_name: string;
  status: string;
  log_json: string;
  error: string | null;
  created_at: Date;
  finished_at: Date | null;
};

function toRecord(r: JobRow): JobRecord {
  return {
    id: r.id,
    kind: r.kind as JobKind,
    target_name: r.target_name,
    status: r.status as JobStatus,
    log: JSON.parse(r.log_json),
    error: r.error,
    created_at: r.created_at.toISOString(),
    finished_at: r.finished_at ? r.finished_at.toISOString() : null,
  };
}

export async function createJob(kind: JobKind, targetName: string): Promise<number> {
  const r = await prisma.job.create({ data: { kind, target_name: targetName, status: "running" } });
  return r.id;
}

// Appends are read-modify-write; serialize them per job so concurrent
// (fire-and-forget) log calls cannot drop each other's lines.
const appendQueues = new Map<number, Promise<void>>();

/** Strips ANSI colour codes so terminal-formatted log lines render cleanly in the browser. */
export function appendJobLog(jobId: number, line: string): Promise<void> {
  const clean = line.replace(/\[[0-9;]*m/g, "");
  const next = (appendQueues.get(jobId) ?? Promise.resolve()).then(async () => {
    const row = await prisma.job.findUnique({ where: { id: jobId }, select: { log_json: true } });
    if (!row) return;
    const log = JSON.parse(row.log_json) as string[];
    log.push(clean);
    await prisma.job.update({ where: { id: jobId }, data: { log_json: JSON.stringify(log) } });
  });
  appendQueues.set(
    jobId,
    next.catch(() => {})
  );
  return next;
}

export async function finishJob(jobId: number, status: JobStatus, error?: string): Promise<void> {
  await prisma.job.update({
    where: { id: jobId },
    data: { status, error: error ?? null, finished_at: new Date() },
  });
  // A flock build adds variants, which every cached target read reflects.
  invalidate();
}

export async function getJob(jobId: number): Promise<JobRecord | undefined> {
  const r = await prisma.job.findUnique({ where: { id: jobId } });
  return r ? toRecord(r) : undefined;
}

export async function activeJobs(): Promise<JobRecord[]> {
  const rows = await prisma.job.findMany({ where: { status: "running" }, orderBy: { id: "desc" } });
  return rows.map(toRecord);
}

export async function recentJobs(targetName?: string, limit = 20): Promise<JobRecord[]> {
  const rows = await prisma.job.findMany({
    where: targetName ? { target_name: targetName } : undefined,
    orderBy: { id: "desc" },
    take: limit,
  });
  return rows.map(toRecord);
}

/**
 * Marks jobs left "running" by a server restart as failed, so the UI never hangs on a ghost.
 *
 * Throttled: this is a WRITE, it was firing on every dashboard poll, and it only ever finds
 * anything after a restart — it looks for jobs stranded for 45 minutes. Running it once a
 * minute is as timely as running it every four seconds, at a sixtieth of the cost.
 */
let lastReap = 0;
export async function reapStaleJobs(): Promise<void> {
  if (Date.now() - lastReap < 60_000) return;
  lastReap = Date.now();
  await prisma.job.updateMany({
    where: { status: "running", created_at: { lt: new Date(Date.now() - 45 * 60_000) } },
    data: { status: "error", error: "interrupted (server restarted)", finished_at: new Date() },
  });
}
