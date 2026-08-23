/**
 * One-off data migration: copies every row from the legacy silk.db (SQLite)
 * into the Postgres database Prisma now points at, preserving primary keys.
 *   npx tsx packages/core/scripts/migrate-sqlite-to-postgres.ts
 * Idempotent-ish: refuses to run if Postgres already has targets, unless --force.
 */
import Database from "better-sqlite3";
import { join } from "node:path";
import { REPO_ROOT } from "../src/env.ts";
import { prisma } from "../src/prisma.ts";

const sqlite = new Database(join(REPO_ROOT, "silk.db"), { readonly: true, fileMustExist: true });

// sqlite datetime('now') strings are UTC without a zone marker
const toDate = (s: string | null): Date | null => (s ? new Date(s.replace(" ", "T") + "Z") : null);
const rows = <T>(table: string): T[] => sqlite.prepare(`SELECT * FROM ${table}`).all() as T[];

async function main() {
  if (!process.argv.includes("--force") && (await prisma.target.count()) > 0) {
    throw new Error("Postgres already contains targets — pass --force to migrate anyway");
  }

  const targets = rows<{ id: number; name: string; url: string; schema_json: string; created_at: string }>("targets");
  await prisma.target.createMany({
    data: targets.map((t) => ({ ...t, created_at: toDate(t.created_at)! })),
    skipDuplicates: true,
  });

  const variants = rows<{ id: number; target_id: number; collector_id: string; strategy: string; status: string; created_at: string }>("variants");
  await prisma.variant.createMany({
    data: variants.map((v) => ({ ...v, created_at: toDate(v.created_at)! })),
    skipDuplicates: true,
  });

  const runs = rows<{ id: number; target_id: number; started_at: string; finished_at: string | null; consensus_json: string | null }>("runs");
  await prisma.run.createMany({
    data: runs.map((r) => ({ ...r, started_at: toDate(r.started_at)!, finished_at: toDate(r.finished_at) })),
    skipDuplicates: true,
  });

  const results = rows<{ id: number; run_id: number; variant_id: number; status: string; rows_json: string | null; error: string | null; dissents_json: string | null }>("variant_results");
  await prisma.variantResult.createMany({ data: results, skipDuplicates: true });

  const votes = rows<{ id: number; run_id: number; row_key: string; field: string; consensus_value: string | null; dissenting_json: string | null }>("votes");
  await prisma.vote.createMany({ data: votes, skipDuplicates: true });

  const heals = rows<{ id: number; variant_id: number; trigger_run_id: number | null; prompt: string; preview_json: string | null; verdict: string | null; verdict_reason: string | null; verification: string | null; started_at: string; decided_at: string | null }>("heal_events");
  await prisma.healEvent.createMany({
    data: heals.map((h) => ({ ...h, started_at: toDate(h.started_at)!, decided_at: toDate(h.decided_at) })),
    skipDuplicates: true,
  });

  const jobs = rows<{ id: number; kind: string; target_name: string; status: string; log_json: string; error: string | null; created_at: string; finished_at: string | null }>("jobs");
  await prisma.job.createMany({
    data: jobs.map((j) => ({ ...j, created_at: toDate(j.created_at)!, finished_at: toDate(j.finished_at) })),
    skipDuplicates: true,
  });

  // Explicit ids bypass Postgres sequences; bump each one past the copied max id.
  for (const table of ["targets", "variants", "runs", "variant_results", "votes", "heal_events", "jobs"]) {
    await prisma.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('${table}','id'), COALESCE((SELECT MAX(id) FROM ${table}), 0) + 1, false)`
    );
  }

  const counts: [string, number, number][] = [
    ["targets", targets.length, await prisma.target.count()],
    ["variants", variants.length, await prisma.variant.count()],
    ["runs", runs.length, await prisma.run.count()],
    ["variant_results", results.length, await prisma.variantResult.count()],
    ["votes", votes.length, await prisma.vote.count()],
    ["heal_events", heals.length, await prisma.healEvent.count()],
    ["jobs", jobs.length, await prisma.job.count()],
  ];
  console.log("table            sqlite  postgres");
  let ok = true;
  for (const [table, from, to] of counts) {
    if (from !== to) ok = false;
    console.log(`${table.padEnd(16)} ${String(from).padStart(6)}  ${String(to).padStart(8)}${from === to ? "" : "  MISMATCH"}`);
  }
  if (!ok) throw new Error("row counts differ between sqlite and postgres");
  console.log("All rows copied.");
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
