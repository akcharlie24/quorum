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

export interface DriftAlertView {
  id: number;
  runId: number;
  /** null = a whole-dataset signal rather than a per-field one. */
  field: string | null;
  kind: string;
  severity: "info" | "warn" | "critical";
  detail: string;
  baseline: number | null;
  current: number | null;
  /** Every scraper was healthy, so the vote had nothing to compare and saw nothing. */
  fleetWide: boolean;
  createdAt: string;
}

const SEVERITY_RANK = { critical: 3, warn: 2, info: 1 } as const;

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
  /**
   * Spider-Sense, kept deliberately separate from `health`.
   *
   * Health describes what the VOTE concluded; drift describes what the vote is
   * structurally unable to conclude. A flock can be perfectly healthy and drifting at
   * the same time — that combination is the whole point of Layer 1 — so collapsing the
   * two into one badge would hide exactly the case worth showing.
   */
  openAlerts: number;
  worstAlert: "info" | "warn" | "critical" | null;
}

export interface TargetDetail extends TargetSummary {
  variants: VariantView[];
  consensus: Row[];
  votes: VoteView[];
  heals: HealView[];
  driftAlerts: DriftAlertView[];
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

/** Signals that are still firing. Resolved ones stay in the table as history for the Bugle. */
export async function openDriftAlerts(targetId: number): Promise<DriftAlertView[]> {
  const rows = await prisma.driftAlert.findMany({
    where: { target_id: targetId, resolved_at: null },
    orderBy: { id: "desc" },
  });
  return rows
    .map((a) => ({
      id: a.id,
      runId: a.run_id,
      field: a.field,
      kind: a.kind,
      severity: a.severity as DriftAlertView["severity"],
      detail: a.detail,
      baseline: a.baseline,
      current: a.current,
      fleetWide: a.fleet_wide,
      createdAt: a.created_at.toISOString(),
    }))
    .sort((x, y) => SEVERITY_RANK[y.severity] - SEVERITY_RANK[x.severity]);
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
      const alerts = await openDriftAlerts(t.id);

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
        openAlerts: alerts.length,
        worstAlert: alerts[0]?.severity ?? null,
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

  return { ...summary, variants, consensus, votes, heals, driftAlerts: await openDriftAlerts(summary.id), runId, history };
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

export interface SummaryFact {
  label: string;
  value: string;
  /** The specific evidence behind the value — a row name, a rejected reading, a count. */
  detail?: string;
  tone?: "good" | "warn" | "bad" | "neutral";
}

export interface FlockSummary {
  headline: string;
  facts: SummaryFact[];
}

function plural(n: number, word: string): string {
  if (n === 1) return `1 ${word}`;
  return `${n} ${word.endsWith("y") && !/[aeiou]y$/.test(word) ? word.slice(0, -1) + "ies" : word + "s"}`;
}

/** Null rates come back as fractions; row counts as counts. Render each as what it is. */
function fmtStat(n: number, kind: string): string {
  if (kind === "null_spike" || kind === "field_vanished") return `${Math.round(n * 100)}% empty`;
  if (kind === "row_count_drop") return `${Math.round(n)} rows`;
  return n.toFixed(2);
}

function joinList(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? "";
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

/**
 * Describes what this particular flock is doing, computed from its own telemetry.
 *
 * Deliberately built from per-flock statistics — which field is contested, which scraper
 * is carrying the run, the single most consequential value the vote rejected — because a
 * summary assembled from generic sentences reads identically for every target and tells
 * the reader nothing they could not have guessed.
 */
export async function summarizeTarget(name: string): Promise<FlockSummary | undefined> {
  const d = await getTargetDetail(name);
  if (!d) return undefined;

  const facts: SummaryFact[] = [];
  const itemLabel = d.schema.itemLabel ?? "row";
  const numericFields = Object.entries(d.schema.fields).filter(([, t]) => t !== "string").map(([f]) => f);

  // — what it watches ————————————————————————————————————
  const pageCount = d.schema.urls?.length;
  facts.push({
    label: "Watching",
    value: pageCount ? `${plural(pageCount, "page")}, named explicitly` : "1 listing page",
    detail: `Extracting ${joinList(Object.keys(d.schema.fields))}; rows identified by ${d.schema.keyField}.`,
    tone: "neutral",
  });

  // — coverage this run ——————————————————————————————————
  if (d.consensus.length > 0) {
    const complete = d.consensus.filter((r) =>
      numericFields.every((f) => r[f] !== null && r[f] !== undefined)
    ).length;
    const missing = d.consensus.length - complete;
    facts.push({
      label: "Latest run",
      value: `${plural(d.consensus.length, itemLabel)} shipped`,
      detail: numericFields.length
        ? `${complete} complete${missing ? `, ${missing} missing ${joinList(numericFields)} — reported as empty rather than guessed` : ""}.`
        : undefined,
      tone: missing === 0 ? "good" : "warn",
    });
  }

  // — which field the scrapers actually fight over ————————————————
  if (d.votes.length > 0) {
    const byField = new Map<string, number>();
    for (const v of d.votes) byField.set(v.field, (byField.get(v.field) ?? 0) + 1);
    const [topField, topCount] = [...byField.entries()].sort((a, b) => b[1] - a[1])[0];
    facts.push({
      label: "Contested field",
      value: `${topField} — ${plural(topCount, "cell")} disputed`,
      detail:
        byField.size > 1
          ? `Other fields disputed: ${joinList([...byField.keys()].filter((f) => f !== topField))}.`
          : `Every other field was unanimous.`,
      tone: "warn",
    });

    // The single clearest save: a peer proposed a different real value and lost.
    const save = d.votes.find((v) =>
      v.dissenting.some((x) => x.value !== null && x.value !== undefined && x.value !== "")
    );
    if (save) {
      const loser = save.dissenting.find((x) => x.value !== null && x.value !== undefined && x.value !== "")!;
      const who = d.variants.find((x) => x.id === loser.variantId)?.strategy ?? "another scraper";
      facts.push({
        label: "Bad value blocked",
        value: `${JSON.stringify(loser.value)} → ${JSON.stringify(save.consensusValue)}`,
        detail: `On "${save.rowKey}", ${who} read ${JSON.stringify(loser.value)} for ${save.field}. A single-scraper pipeline would have shipped it.`,
        tone: "bad",
      });
    }
  } else if (d.consensus.length > 0) {
    facts.push({
      label: "Agreement",
      value: "unanimous",
      detail: "No cell needed arbitration this run.",
      tone: "good",
    });
  }

  // — who is carrying the run, by track record —————————————————
  const weights = await variantWeights(d.id);
  if (weights.size > 0) {
    const ranked = d.variants
      .map((v) => ({ strategy: v.strategy, w: weights.get(v.id) ?? 1, status: v.lastRunStatus }))
      .sort((a, b) => b.w - a.w);
    const best = ranked[0];
    const worst = ranked[ranked.length - 1];
    if (best && worst && best.strategy !== worst.strategy) {
      facts.push({
        label: "Most trusted scraper",
        value: `${best.strategy} (${Math.round(best.w * 100)}% agreement)`,
        detail: `${worst.strategy} sits at ${Math.round(worst.w * 100)}%; its vote is weighted down when the two disagree.`,
        tone: "neutral",
      });
    }
  }

  // — failures the flock absorbed ——————————————————————————
  const broken = d.variants.filter((v) => v.lastRunStatus === "broken");
  if (broken.length > 0) {
    facts.push({
      label: "Scraper down",
      value: `${joinList(broken.map((b) => b.strategy))} returned nothing`,
      detail: `${d.variants.length - broken.length} of ${d.variants.length} scrapers produced the output. No data was lost.`,
      tone: "bad",
    });
  }

  // — what the vote could not have seen ——————————————————————
  if (d.driftAlerts.length > 0) {
    const worst = d.driftAlerts[0];
    const fleet = d.driftAlerts.filter((a) => a.fleetWide).length;
    facts.push({
      label: "Spider-Sense",
      value:
        worst.baseline !== null && worst.current !== null && worst.kind !== "value_collapse"
          ? `${worst.field ?? "row count"}: ${fmtStat(worst.baseline, worst.kind)} → ${fmtStat(worst.current, worst.kind)}`
          : worst.detail,
      detail: fleet
        ? `Every scraper agreed on this, so the vote could not have caught it — only comparing against this flock's own history did.`
        : `Flagged by comparing this run against the flock's recent history, not against its peers.`,
      tone: worst.severity === "critical" ? "bad" : "warn",
    });
  }

  // — repairs ———————————————————————————————————————
  if (d.heals.length > 0) {
    const approved = d.heals.filter((h) => h.verdict === "approved").length;
    const rejected = d.heals.filter((h) => h.verdict === "rejected").length;
    const regressed = d.heals.filter((h) => h.verification === "regressed").length;
    facts.push({
      label: "Self-healing",
      value: `${approved} approved · ${rejected} rejected`,
      detail:
        (regressed
          ? `${plural(regressed, "approved fix")} later failed in production and was flagged. `
          : "") + "Every decision was made by the vote, with no human review.",
      tone: regressed > 0 ? "warn" : "good",
    });
  }

  // A fleet-wide critical must own the headline. "All 3 scrapers agreed" is technically
  // true and actively misleading here: the agreement IS the finding, and leading with it
  // as reassurance is precisely the failure mode Layer 1 exists to prevent.
  const silent = d.driftAlerts.find((a) => a.fleetWide && a.severity === "critical");
  const headline = silent
    ? `All ${d.variants.length} scrapers agree — and the data still moved: ${silent.detail}.`
    : d.health === "healthy"
      ? `All ${d.variants.length} scrapers agreed — nothing needed arbitration.`
      : d.health === "protected"
        ? d.votes.length > 0
          ? `The vote overruled ${plural(d.votes.length, "reading")} before they reached the output.`
          : "A scraper failed and the others carried the run."
        : d.health === "unverified"
          ? "Only one scraper reported — nothing here has been cross-checked."
          : d.health === "down"
            ? "No usable output from this flock."
            : "This flock has not run yet.";

  return { headline, facts };
}
