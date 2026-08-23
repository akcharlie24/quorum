/**
 * Builds ONE steam-prices variant. Validate before paying for a quorum: five previous
 * Steam builds produced crawlers, so one scraper proves the per-page framing works
 * before we spend on the other two.
 */
import { loadEnv } from "../src/env.ts";
import { createScraperAwaited } from "../src/brightdata.ts";
import { addVariant, getTarget, getVariants } from "../src/db.ts";
import { strategyPrompts } from "../src/strategies.ts";
import { prisma } from "../src/prisma.ts";
import type { VariantStrategy } from "../src/types.ts";

loadEnv();
const STRATEGY = (process.argv[2] ?? "text-anchor") as VariantStrategy;

async function main() {
  const target = await getTarget("steam-prices");
  if (!target) throw new Error("run steam-setup.ts first");
  const existing = await getVariants(target.id);
  if (existing.some((v) => v.strategy === STRATEGY)) {
    console.log(`${STRATEGY} already exists — nothing to build`);
    return prisma.$disconnect();
  }

  // Build against one product page; the URL list is only used at run time.
  const seed = target.schema.urls![0];
  const prompt = strategyPrompts(target.schema)[STRATEGY];
  console.log(`building ${STRATEGY} against ${seed}\n  ${prompt}\n`);

  const t0 = Date.now();
  const { collectorId } = await createScraperAwaited(seed, prompt, (id) =>
    console.log(`  accepted ${id}, generating…`)
  );
  await addVariant(target.id, collectorId, STRATEGY);
  console.log(`✔ READY ${collectorId} (${((Date.now() - t0) / 60000).toFixed(1)} min)`);
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error("✘", String(e).slice(0, 500)); await prisma.$disconnect(); process.exit(1); });
