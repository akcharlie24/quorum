/** Retires duplicate strategies for a target, keeping the newest of each. */
import { getTarget, getVariants, retireVariant } from "../src/db.ts";
import { prisma } from "../src/prisma.ts";

async function main() {
  const name = process.argv[2] ?? "ikea-desks";
  const t = await getTarget(name);
  if (!t) throw new Error(`no target ${name}`);
  const active = await getVariants(t.id);
  const newest = new Map<string, number>();
  for (const v of active) newest.set(v.strategy, Math.max(newest.get(v.strategy) ?? 0, v.id));
  for (const v of active) {
    if (newest.get(v.strategy) !== v.id) {
      await retireVariant(v.id);
      console.log(`retired duplicate ${v.strategy} #${v.id} (${v.collector_id})`);
    }
  }
  for (const v of await getVariants(t.id)) console.log(`  keeping ${v.strategy.padEnd(12)} ${v.collector_id}`);
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
