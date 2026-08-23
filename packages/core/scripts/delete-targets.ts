/**
 * Removes targets and everything hanging off them. Rows are deleted child-first
 * because the schema has no cascade: votes and results reference runs, heals
 * reference variants, and both reference the target.
 * Dry run by default; pass --yes to actually delete.
 */
import { prisma } from "../src/prisma.ts";

const NAMES = ["ikea-desks", "github-trending", "books-control", "steam-top-sellers"];
const CONFIRMED = process.argv.includes("--yes");

async function main() {
  for (const name of NAMES) {
    const t = await prisma.target.findUnique({ where: { name } });
    if (!t) {
      console.log(`  ${name.padEnd(20)} not present`);
      continue;
    }
    const runIds = (await prisma.run.findMany({ where: { target_id: t.id }, select: { id: true } })).map((r) => r.id);
    const variantIds = (await prisma.variant.findMany({ where: { target_id: t.id }, select: { id: true } })).map((v) => v.id);
    const counts = {
      runs: runIds.length,
      variants: variantIds.length,
      results: await prisma.variantResult.count({ where: { run_id: { in: runIds } } }),
      votes: await prisma.vote.count({ where: { run_id: { in: runIds } } }),
      heals: await prisma.healEvent.count({ where: { variant_id: { in: variantIds } } }),
      jobs: await prisma.job.count({ where: { target_name: name } }),
    };
    console.log(`  ${name.padEnd(20)} ${JSON.stringify(counts)}`);

    if (!CONFIRMED) continue;
    await prisma.$transaction([
      prisma.vote.deleteMany({ where: { run_id: { in: runIds } } }),
      prisma.variantResult.deleteMany({ where: { run_id: { in: runIds } } }),
      prisma.healEvent.deleteMany({ where: { variant_id: { in: variantIds } } }),
      prisma.run.deleteMany({ where: { target_id: t.id } }),
      prisma.variant.deleteMany({ where: { target_id: t.id } }),
      prisma.target.delete({ where: { id: t.id } }),
      prisma.job.deleteMany({ where: { target_name: name } }),
    ]);
    console.log(`    deleted`);
  }
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
