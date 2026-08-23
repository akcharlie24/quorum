import { invalidate } from "./cache.ts";
import { prisma } from "./prisma.ts";
import type { TargetSchema, VariantStrategy } from "./types.ts";

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

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

export async function upsertTarget(name: string, url: string, schema: TargetSchema): Promise<TargetRecord> {
  const r = await prisma.target.upsert({
    where: { name },
    create: { name, url, schema_json: JSON.stringify(schema) },
    update: { url, schema_json: JSON.stringify(schema) },
  });
  return { id: r.id, name: r.name, url: r.url, schema: JSON.parse(r.schema_json) };
}

export async function getTarget(name: string): Promise<TargetRecord | undefined> {
  const r = await prisma.target.findUnique({ where: { name } });
  return r ? { id: r.id, name: r.name, url: r.url, schema: JSON.parse(r.schema_json) } : undefined;
}

export async function addVariant(
  targetId: number,
  collectorId: string,
  strategy: VariantStrategy
): Promise<void> {
  await prisma.variant.create({ data: { target_id: targetId, collector_id: collectorId, strategy } });
}

/**
 * Retires a target's current variants so a rebuilt Flock replaces them.
 * Rows are kept, not deleted — past runs and heal history must stay readable.
 */
export async function retireVariants(targetId: number): Promise<number> {
  const r = await prisma.variant.updateMany({
    where: { target_id: targetId, status: "active" },
    data: { status: "retired" },
  });
  return r.count;
}

/**
 * Retires a single variant so the Flock can regenerate it.
 * Healing rewrites extraction logic; it cannot undo a collector that was generated
 * to crawl detail pages. When a fix regresses, replacing the scraper is the cure.
 */
export async function retireVariant(variantId: number): Promise<void> {
  await prisma.variant.updateMany({ where: { id: variantId }, data: { status: "retired" } });
}

export async function getVariants(targetId: number): Promise<VariantRecord[]> {
  const rows = await prisma.variant.findMany({ where: { target_id: targetId, status: "active" } });
  return rows.map((v) => ({
    id: v.id,
    target_id: v.target_id,
    collector_id: v.collector_id,
    strategy: v.strategy as VariantStrategy,
    status: v.status,
  }));
}

export async function startRun(targetId: number): Promise<number> {
  const r = await prisma.run.create({ data: { target_id: targetId, started_at: new Date() } });
  return r.id;
}

export async function finishRun(runId: number, consensusRows: unknown[]): Promise<void> {
  await prisma.run.update({
    where: { id: runId },
    data: { finished_at: new Date(), consensus_json: JSON.stringify(consensusRows) },
  });
  // A finished run changes every cached read there is; drop them rather than make the
  // operator wait out a TTL to see the cycle they just triggered.
  invalidate();
}

export async function recordVariantResult(
  runId: number,
  variantId: number,
  status: string,
  rows: unknown[],
  error: string | undefined,
  dissents: string[]
): Promise<void> {
  await prisma.variantResult.create({
    data: {
      run_id: runId,
      variant_id: variantId,
      status,
      rows_json: JSON.stringify(rows),
      error: error ?? null,
      dissents_json: JSON.stringify(dissents),
    },
  });
}

export async function recordVote(
  runId: number,
  rowKey: string,
  field: string,
  consensusValue: unknown,
  dissenting: unknown[]
): Promise<void> {
  await prisma.vote.create({
    data: {
      run_id: runId,
      row_key: rowKey,
      field,
      consensus_value: JSON.stringify(consensusValue ?? null),
      dissenting_json: JSON.stringify(dissenting),
    },
  });
}

export async function startHealEvent(variantId: number, triggerRunId: number, prompt: string): Promise<number> {
  const r = await prisma.healEvent.create({
    data: { variant_id: variantId, trigger_run_id: triggerRunId, prompt, verdict: "pending" },
  });
  return r.id;
}

export async function decideHealEvent(
  healId: number,
  verdict: "approved" | "rejected" | "needs_human",
  reason: string,
  preview: unknown[]
): Promise<void> {
  await prisma.healEvent.update({
    where: { id: healId },
    data: { verdict, verdict_reason: reason, preview_json: JSON.stringify(preview), decided_at: new Date() },
  });
}

/** Approved heals that have not yet been confirmed against a live run. */
export async function unverifiedHeals(targetId: number): Promise<{ id: number; variant_id: number }[]> {
  return prisma.healEvent.findMany({
    where: { verdict: "approved", verification: null, variant: { target_id: targetId } },
    select: { id: true, variant_id: true },
  });
}

export async function setHealVerification(
  healId: number,
  status: "verified" | "regressed",
  note: string
): Promise<void> {
  const heal = await prisma.healEvent.findUnique({ where: { id: healId }, select: { verdict_reason: true } });
  if (!heal) return;
  await prisma.healEvent.update({
    where: { id: healId },
    data: { verification: status, verdict_reason: `${heal.verdict_reason ?? ""} | ${note}` },
  });
}

export async function lastRuns(targetId: number, limit = 10) {
  const rows = await prisma.run.findMany({
    where: { target_id: targetId },
    orderBy: { id: "desc" },
    take: limit,
  });
  return rows.map((r) => ({
    id: r.id,
    target_id: r.target_id,
    started_at: r.started_at.toISOString(),
    finished_at: iso(r.finished_at),
    consensus_json: r.consensus_json,
  }));
}

export async function pendingHeals(): Promise<unknown[]> {
  return prisma.healEvent.findMany({ where: { verdict: "pending" } });
}

export async function allTargets(): Promise<TargetRecord[]> {
  const rows = await prisma.target.findMany();
  return rows.map((r) => ({ id: r.id, name: r.name, url: r.url, schema: JSON.parse(r.schema_json) }));
}

export { prisma };
