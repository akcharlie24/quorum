import { prisma } from "../src/prisma.ts";
async function main() {
  const rows = await prisma.variant.findMany({
    where: { target: { name: "ikea-desks" } }, orderBy: { id: "asc" },
  });
  for (const v of rows) console.log(`  #${v.id} ${v.strategy.padEnd(12)} ${v.status.padEnd(8)} ${v.collector_id}`);
  await prisma.$disconnect();
}
main();
