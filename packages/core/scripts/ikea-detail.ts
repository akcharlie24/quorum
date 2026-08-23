import { prisma } from "../src/prisma.ts";
async function main() {
  const run = await prisma.run.findFirst({ where: { target: { name: "ikea-desks" }, finished_at: { not: null } }, orderBy: { id: "desc" } });
  const rows = await prisma.variantResult.findMany({
    where: { run_id: run!.id }, include: { variant: { select: { strategy: true, status: true } } },
  });
  console.log(`run #${run!.id}\n`);
  for (const r of rows) {
    const parsed = JSON.parse(r.rows_json ?? "[]") as { title: string; price: number | null }[];
    const sample = parsed.slice(0, 3).map((x) => x.price).join(", ");
    console.log(`  ${r.variant.strategy.padEnd(12)} [${r.variant.status}] ${r.status.padEnd(11)} rows=${parsed.length} first prices: ${sample}`);
  }
  await prisma.$disconnect();
}
main();
