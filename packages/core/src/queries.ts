import { prisma } from "./prisma.ts";
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

async function latestRunId(targetId: number): Promise<number | null> {
  const r = await prisma.run.findFirst({
    where: { target_id: targetId, finished_at: { not: null } },
    orderBy: { id: "desc" },
    select: { id: true },
  });
  return r?.id ?? null;
}

async function runStatuses(runId: number): Promise<string[]> {
  const rows = await prisma.variantResult.findMany({ where: { run_id: runId }, select: { status: true } });
  return rows.map((r) => r.status);
}

export async function listTargets(): Promise<TargetSummary[]> {
  const targets = await prisma.target.findMany({ orderBy: { id: "desc" } });

  return Promise.all(
    targets.map(async (t) => {
      const runId = await latestRunId(t.id);
      const variantCount = await prisma.variant.count({ where: { target_id: t.id, status: "active" } });
      const runCount = await prisma.run.count({ where: { target_id: t.id, finished_at: { not: null } } });
      const healApproved = await prisma.healEvent.count({
        where: { verdict: "approved", variant: { target_id: t.id } },
      });

      let health: TargetSummary["health"] = "pending";
      let consensusRows = 0;
      let lastRunAt: string | null = null;

      if (runId) {
        const run = await prisma.run.findUniqueOrThrow({
          where: { id: runId },
          select: { started_at: true, consensus_json: true },
        });
        lastRunAt = run.started_at.toISOString();
        consensusRows = run.consensus_json ? (JSON.parse(run.consensus_json) as Row[]).length : 0;
        const statuses = await runStatuses(runId);
        const broken = statuses.filter((s) => s === "broken").length;
        const dissenting = statuses.filter((s) => s === "dissenting").length;
        health = consensusRows === 0 || broken >= 2 ? "down" : broken + dissenting > 0 ? "degraded" : "healthy";
      }

      return {
        id: t.id,
        name: t.name,
        url: t.url,
        schema: JSON.parse(t.schema_json) as TargetSchema,
        variantCount,
        health,
        lastRunAt,
        consensusRows,
        runCount,
        healApproved,
      };
    })
  );
}

export async function getTargetDetail(name: string): Promise<TargetDetail | undefined> {
  const summary = (await listTargets()).find((t) => t.name === name);
  if (!summary) return undefined;

  const runId = await latestRunId(summary.id);
  const variantRows = await prisma.variant.findMany({
    where: { target_id: summary.id, status: "active" },
    orderBy: { id: "asc" },
  });

  const variants: VariantView[] = await Promise.all(
    variantRows.map(async (v) => {
      const res = runId
        ? await prisma.variantResult.findFirst({
            where: { run_id: runId, variant_id: v.id },
            select: { status: true, dissents_json: true, error: true },
          })
        : null;
      return {
        id: v.id,
        collector_id: v.collector_id,
        strategy: v.strategy as VariantStrategy,
        status: v.status,
        lastRunStatus: res?.status ?? null,
        dissentCount: res?.dissents_json ? (JSON.parse(res.dissents_json) as string[]).length : 0,
        error: res?.error ?? null,
      };
    })
  );

  let consensus: Row[] = [];
  let votes: VoteView[] = [];
  if (runId) {
    const run = await prisma.run.findUniqueOrThrow({ where: { id: runId }, select: { consensus_json: true } });
    consensus = run.consensus_json ? JSON.parse(run.consensus_json) : [];
    const voteRows = await prisma.vote.findMany({ where: { run_id: runId } });
    votes = voteRows.map((v) => ({
      rowKey: v.row_key,
      field: v.field,
      consensusValue: v.consensus_value ? JSON.parse(v.consensus_value) : null,
      dissenting: v.dissenting_json ? JSON.parse(v.dissenting_json) : [],
    }));
  }

  const healRows = await prisma.healEvent.findMany({
    where: { variant: { target_id: summary.id } },
    include: { variant: { select: { strategy: true } } },
    orderBy: { id: "desc" },
    take: 20,
  });
  const heals: HealView[] = healRows.map((h) => ({
    id: h.id,
    variantId: h.variant_id,
    strategy: h.variant.strategy,
    prompt: h.prompt,
    verdict: h.verdict ?? "pending",
    verdict_reason: h.verdict_reason,
    verification: h.verification,
    started_at: h.started_at.toISOString(),
    decided_at: h.decided_at ? h.decided_at.toISOString() : null,
  }));

  const historyRuns = await prisma.run.findMany({
    where: { target_id: summary.id, finished_at: { not: null } },
    orderBy: { id: "desc" },
    take: 12,
    select: { id: true, started_at: true },
  });
  const history = await Promise.all(
    historyRuns.reverse().map(async (r) => {
      const statuses = await runStatuses(r.id);
      return {
        runId: r.id,
        startedAt: r.started_at.toISOString(),
        healthy: statuses.filter((s) => s === "healthy").length,
        dissenting: statuses.filter((s) => s === "dissenting").length,
        broken: statuses.filter((s) => s === "broken").length,
      };
    })
  );

  return { ...summary, variants, consensus, votes, heals, runId, history };
}
