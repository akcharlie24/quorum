import { prisma } from "../src/prisma.ts";

async function main() {
  const [t, v, r, vr, vo, h] = await Promise.all([
    prisma.target.count(), prisma.variant.count(), prisma.run.count(),
    prisma.variantResult.count(), prisma.vote.count(), prisma.healEvent.count(),
  ]);
  console.log(`targets=${t} variants=${v} runs=${r} variantResults=${vr} votes=${vo} heals=${h}`);
  console.log("\n--- targets ---");
  for (const tg of await prisma.target.findMany({ orderBy: { id: "asc" } })) {
    const runs = await prisma.run.count({ where: { target_id: tg.id } });
    const active = await prisma.variant.count({ where: { target_id: tg.id, status: "active" } });
    const best = await prisma.run.findFirst({
      where: { target_id: tg.id, consensus_json: { not: null } },
      orderBy: { id: "desc" }, select: { consensus_json: true },
    });
    const rows = best?.consensus_json ? (JSON.parse(best.consensus_json) as unknown[]).length : 0;
    console.log(`  ${tg.name.padEnd(20)} activeVariants=${active} runs=${runs} latestConsensusRows=${rows}`);
  }
  await prisma.$disconnect();
}
main();
