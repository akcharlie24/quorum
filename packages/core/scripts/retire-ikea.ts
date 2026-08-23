import { getTarget, getVariants, retireVariant } from "../src/db.ts";
import { prisma } from "../src/prisma.ts";
async function main() {
  const t = await getTarget("ikea-desks");
  for (const v of await getVariants(t!.id)) {
    if (v.strategy !== "text-anchor") { await retireVariant(v.id); console.log("retired", v.strategy); }
  }
  await prisma.$disconnect();
}
main();
