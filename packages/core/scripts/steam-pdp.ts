/**
 * Steam attempt #5 — but with the grain instead of against it.
 *
 * Four builds have produced detail-page crawlers for the top-sellers URL: Bright Data's
 * planner insists on walking to each /app/ page, then finds no *listing* there and
 * returns {"games": []}. Rather than forbid the crawl a fifth time, this asks for what
 * a product page actually holds: ONE game's title and price per page. Same schema,
 * same consensus machinery — only the framing changes.
 */
import { loadEnv } from "../src/env.ts";
import { createScraperAwaited } from "../src/brightdata.ts";
import { addVariant, getVariants, retireVariant, upsertTarget } from "../src/db.ts";
import { sanitizePrompt } from "../src/brightdata.ts";
import { MAX_DESCRIPTION } from "../src/strategies.ts";
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

const PROMPT = sanitizePrompt(
  "From this Steam top-sellers listing, collect every game. For each game return one " +
    "JSON object with title (string, the game name) and price (number, the current price " +
    "in USD as digits only, 0 for Free to Play). Use these exact field names and plain " +
    "scalar values, never nested objects. Return a flat array of games."
).slice(0, MAX_DESCRIPTION);

async function main() {
  const target = await upsertTarget(NAME, URL, SCHEMA);
  for (const v of await getVariants(target.id)) {
    await retireVariant(v.id);
    console.log(`retired #${v.id} ${v.strategy}`);
  }

  console.log(`\nprompt (${PROMPT.length} chars):\n  ${PROMPT}\n`);
  const t0 = Date.now();
  const { collectorId } = await createScraperAwaited(URL, PROMPT, (id) =>
    console.log(`  accepted ${id}, generating…`)
  );
  await addVariant(target.id, collectorId, "text-anchor");
  console.log(`✔ READY ${collectorId} (${((Date.now() - t0) / 60000).toFixed(1)} min)`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("✘", String(e).slice(0, 600));
  await prisma.$disconnect();
  process.exit(1);
});
