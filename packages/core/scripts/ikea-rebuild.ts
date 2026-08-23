/** Retires the cent-dropping variants so they can be rebuilt with the corrected prompt. */
import { getTarget, getVariants, retireVariant } from "../src/db.ts";
import { prisma } from "../src/prisma.ts";
async function main() {
  const t = await getTarget("ikea-desks");
  for (const v of await getVariants(t!.id)) {
    if (v.strategy === "text-anchor") continue; // this one read the price correctly
    await retireVariant(v.id);
    console.log(`retired ${v.strategy} (${v.collector_id}) — dropped cents`);
  }
  await prisma.$disconnect();
}
main();
