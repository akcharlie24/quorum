/**
 * Rebuilds the steam-prices variant with PRICE FIRST in the prompt.
 *
 * Three approved heals across two accounts have failed to change deployed behaviour,
 * including one that asked to add a price field and previewed it correctly. The
 * evidence says Bright Data fixes the output schema at build time and heal only
 * rewrites extraction within it — so a missing field must be present from the start.
 */
import { loadEnv } from "../src/env.ts";
import { createScraperAwaited, sanitizePrompt } from "../src/brightdata.ts";
import { addVariant, getTarget, getVariants, retireVariant } from "../src/db.ts";
import { MAX_DESCRIPTION } from "../src/strategies.ts";
import { prisma } from "../src/prisma.ts";

loadEnv();

/**
 * price is requested as a STRING, deliberately.
 *
 * Asking for a number made Bright Data's generated parser throw
 * "Parse error: value must be finite number" on every Free To Play game — it cannot
 * produce a number where no price exists, so the whole row is lost. Taking the text
 * exactly as shown and parsing it ourselves keeps that failure inside our own tested
 * coercion (which yields 8.99 from "$8.99" and null from "Free To Play").
 */
const PROMPT = sanitizePrompt(
  "Extract two fields from this Steam game page. price_text: the price exactly as " +
    "displayed, as a string, for example \"$59.99\" or \"Free To Play\"; never omit it. " +
    "title: the game name as a string. Always return both fields as plain strings."
).slice(0, MAX_DESCRIPTION);

async function main() {
  const target = await getTarget("steam-prices");
  if (!target) throw new Error("run steam-setup.ts first");

  for (const v of await getVariants(target.id)) {
    await retireVariant(v.id);
    console.log(`retired #${v.id} ${v.strategy} (title-only schema)`);
  }

  const seed = target.schema.urls![0];
  console.log(`\nbuilding against ${seed}\n  ${PROMPT}\n`);
  const t0 = Date.now();
  const { collectorId } = await createScraperAwaited(seed, PROMPT, (id) =>
    console.log(`  accepted ${id}, generating…`)
  );
  await addVariant(target.id, collectorId, "text-anchor");
  console.log(`✔ READY ${collectorId} (${((Date.now() - t0) / 60000).toFixed(1)} min)`);
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error("✘", String(e).slice(0, 500)); await prisma.$disconnect(); process.exit(1); });
