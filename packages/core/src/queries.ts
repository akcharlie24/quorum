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
  /**
   * Describes the DATA, not the fleet.
   *  healthy    — every scraper agreed
   *  protected  — scrapers disagreed and the quorum resolved it; output is trustworthy
   *  unverified — output exists but too few scrapers reported to cross-check it
   *  down       — no usable output
   *  pending    — never run
   *
   * "protected" deliberately replaces "degraded": a run where the vote overruled a bad
   * reading has *proven* its output, and labelling that as degradation describes the
   * scrapers while implying the data is suspect — the opposite of what happened.
   */
  health: "healthy" | "protected" | "unverified" | "down" | "pending";
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
        const contributing = statuses.length - broken;
        health =
          consensusRows === 0 || broken >= 2
            ? "down"
            : contributing < 2
              ? "unverified" // a lone scraper has nothing to be checked against
              : broken + dissenting > 0
                ? "protected" // the vote caught a bad reading and kept it out
                : "healthy";
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

/**
 * A variant's vote weight, from how often it has agreed with consensus.
 *
 * Laplace-smoothed so a new scraper starts neutral rather than untrusted, and floored
 * so a bad run never silences a variant entirely — reputation should tilt a close call,
 * not hand one scraper a veto.
 */
export async function variantWeights(targetId: number, lookback = 10): Promise<Map<number, number>> {
  const runs = await prisma.run.findMany({
    where: { target_id: targetId, finished_at: { not: null } },
    orderBy: { id: "desc" },
    take: lookback,
    select: { id: true },
  });
  const weights = new Map<number, number>();
  if (runs.length === 0) return weights;

  const results = await prisma.variantResult.findMany({
    where: { run_id: { in: runs.map((r) => r.id) } },
    select: { variant_id: true, status: true },
  });
  const tally = new Map<number, { agreed: number; total: number }>();
  for (const r of results) {
    const t = tally.get(r.variant_id) ?? { agreed: 0, total: 0 };
    t.total += 1;
    if (r.status === "healthy") t.agreed += 1;
    tally.set(r.variant_id, t);
  }
  for (const [id, t] of tally) {
    weights.set(id, Math.max(0.25, (t.agreed + 1) / (t.total + 2)));
  }
  return weights;
}
