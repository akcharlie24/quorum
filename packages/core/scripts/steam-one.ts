/**
 * Builds a SINGLE Steam variant to validate the target before committing to a full
 * Flock. Steam has produced detail-page crawlers on three previous builds, and a
 * crawler costs ~150 page loads per run while returning nothing — so we prove one
 * scraper is sane before paying for three.
 */
import { loadEnv } from "../src/env.ts";
import { createScraperAwaited } from "../src/brightdata.ts";
import { addVariant, getTarget, getVariants, retireVariant, upsertTarget } from "../src/db.ts";
import { strategyPrompts } from "../src/strategies.ts";
import { prisma } from "../src/prisma.ts";
import type { TargetSchema } from "../src/types.ts";

loadEnv();

const NAME = "steam-top-sellers";
const URL = "https://store.steampowered.com/search/?filter=topsellers";
const SCHEMA: TargetSchema = {
  keyField: "title",
  fields: { title: "string", price: "number" },
  itemLabel: "game",
};
const STRATEGY = "text-anchor" as const; // best performer on IMDb; css reliably crawls

async function main() {
  const target = await upsertTarget(NAME, URL, SCHEMA);

  // Collectors belong to the account that made them; the old key's are unusable.
  for (const v of await getVariants(target.id)) {
    await retireVariant(v.id);
    console.log(`retired stale variant #${v.id} ${v.strategy} (${v.collector_id})`);
  }

  const prompt = strategyPrompts(SCHEMA)[STRATEGY];
  console.log(`\nprompt (${prompt.length} chars):\n  ${prompt}\n`);
  console.log(`building ${STRATEGY} …`);

  const t0 = Date.now();
  const { collectorId } = await createScraperAwaited(URL, prompt, (id) =>
    console.log(`  accepted ${id}, generating…`)
  );
  await addVariant(target.id, collectorId, STRATEGY);
  console.log(`✔ READY ${collectorId} (${((Date.now() - t0) / 60000).toFixed(1)} min)`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("✘", String(e).slice(0, 600));
  await prisma.$disconnect();
  process.exit(1);
});
