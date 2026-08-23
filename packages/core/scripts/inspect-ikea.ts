import { prisma } from "../src/prisma.ts";
async function main() {
  const run = await prisma.run.findFirst({ where: { target: { name: "ikea-desks" } }, orderBy: { id: "desc" } });
  const rows = await prisma.variantResult.findMany({
    where: { run_id: run!.id }, include: { variant: { select: { strategy: true } } },
  });
  for (const r of rows) {
    const parsed = JSON.parse(r.rows_json ?? "[]") as any[];
    console.log(`\n${r.variant.strategy} (${r.status}) — ${parsed.length} rows`);
    for (const p of parsed.slice(0, 4)) console.log(`   ${String(p.title).slice(0, 40).padEnd(40)} ${p.price}`);
  }
  await prisma.$disconnect();
}
main();
