/**
 * IKEA desks target. URLs and expected prices were read off the live category page
 * first, so we can grade the flock's output against known-correct values instead of
 * only against itself.
 *
 * Titles must include the colour: IKEA lists several MICKE desks that differ only by
 * finish, and since title is the key field, a bare "MICKE" would collapse them into
 * one row.
 */
import { upsertTarget } from "../src/db.ts";
import { prisma } from "../src/prisma.ts";
import type { TargetSchema } from "../src/types.ts";

export const EXPECTED: Record<string, number> = {
  "micke-desk-white-80213074": 99.99,
  "lagkapten-alex-desk-white-s99431982": 209.97,
  "micke-desk-black-brown-60244745": 99.99,
  "lagkapten-alex-desk-gray-wood-effect-black-s19584926": 139.98,
  "kallax-desk-white-stained-oak-effect-90585101": 79.99,
  "micke-desk-white-30213076": 69.99,
  "alex-drawer-unit-white-00473546": 79.99,
  "lagkapten-alex-desk-white-s49431927": 144.98,
  "tonstad-desk-oak-veneer-30538198": 329.99,
  "lagkapten-adils-desk-white-s59417153": 79.99,
  "lagkapten-alex-desk-white-s59417619": 247.47,
  "malm-dressing-table-white-10203610": 149.99,
};

const SCHEMA: TargetSchema = {
  keyField: "title",
  fields: { title: "string", price: "number" },
  itemLabel: "desk",
  urls: Object.keys(EXPECTED).map((slug) => `https://www.ikea.com/us/en/p/${slug}/`),
};

async function main() {
  const t = await upsertTarget("ikea-desks", SCHEMA.urls![0], SCHEMA);
  console.log(`target #${t.id} ikea-desks — ${SCHEMA.urls!.length} product pages`);
  console.log(`per-cycle: ${SCHEMA.urls!.length} pages x 3 variants = ${SCHEMA.urls!.length * 3} page loads`);
  console.log(`\nexpected prices (read from the live category page):`);
  for (const [slug, price] of Object.entries(EXPECTED)) console.log(`  $${String(price).padEnd(7)} ${slug}`);
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
