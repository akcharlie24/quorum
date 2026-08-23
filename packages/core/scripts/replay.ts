/**
 * Recomputes consensus from stored variant output — no scraping, no credits.
 * Lets a change to the voting rules be validated against real captured data.
 */
import { prisma } from "../src/prisma.ts";
import { consensus } from "../src/consensus.ts";
import type { Row, TargetSchema } from "../src/types.ts";

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
  for (const r of res.rows) console.log("  %-34s %s", String(r.title).slice(0, 34), r.price);
  await prisma.$disconnect();
}
main();
