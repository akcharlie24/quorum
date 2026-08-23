/**
 * Recomputes consensus from stored variant output — no scraping, no credits.
 * Lets a change to the voting rules be validated against real captured data.
 */
import { prisma } from "../src/prisma.ts";
import { consensus } from "../src/consensus.ts";
import type { Row, TargetSchema } from "../src/types.ts";

// `--write` re-votes a stored run in place: the scraped rows are untouched, only the
// verdicts and consensus are recomputed. That lets a voting-rule fix reach runs that
// were recorded under the old rules, without paying to scrape them again.
const WRITE = process.argv.includes("--write");

async function main() {
  const name = process.argv[2] ?? "steam-prices";
  const target = await prisma.target.findFirstOrThrow({ where: { name } });
  const schema = JSON.parse(target.schema_json) as TargetSchema;
  const run = await prisma.run.findFirstOrThrow({
    where: { target_id: target.id, finished_at: { not: null } },
    orderBy: { id: "desc" },
  });
  const results = await prisma.variantResult.findMany({
    where: { run_id: run.id },
    include: { variant: { select: { strategy: true } } },
  });

  const res = consensus(
    results.map((r) => ({
      variantId: r.variant_id,
      rows: JSON.parse(r.rows_json ?? "[]") as Row[],
      error: r.error ?? undefined,
    })),
    schema
  );

  console.log(`replaying run #${run.id} (${name}) with current voting rules\n`);
  for (const v of res.verdicts) {
    const s = results.find((r) => r.variant_id === v.variantId)!;
    console.log(`  ${s.variant.strategy.padEnd(12)} ${v.status} (${v.dissents.length} dissents)`);
  }
  const priced = res.rows.filter((r) => r.price !== null && r.price !== undefined).length;
  console.log(`\n${res.rows.length} rows, ${priced} with a price:`);
  for (const r of res.rows) {
    console.log(`  ${String(r.title).slice(0, 34).padEnd(34)} ${r.price ?? "—"}`);
  }

  if (WRITE) {
    await prisma.$transaction([
      prisma.run.update({ where: { id: run.id }, data: { consensus_json: JSON.stringify(res.rows) } }),
      prisma.vote.deleteMany({ where: { run_id: run.id } }),
      prisma.vote.createMany({
        data: res.votes.map((v) => ({
          run_id: run.id,
          row_key: v.rowKey,
          field: v.field,
          consensus_value: JSON.stringify(v.consensusValue ?? null),
          dissenting_json: JSON.stringify(v.dissenting),
        })),
      }),
      ...res.verdicts.map((v) =>
        prisma.variantResult.updateMany({
          where: { run_id: run.id, variant_id: v.variantId },
          data: { status: v.status, dissents_json: JSON.stringify(v.dissents) },
        })
      ),
    ]);
    console.log(`\nwrote corrected consensus + ${res.votes.length} votes back to run #${run.id}`);
  } else {
    console.log("\n(dry run — pass --write to persist)");
  }
  await prisma.$disconnect();
}
main();
