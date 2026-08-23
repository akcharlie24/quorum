/** Builds one ikea-desks variant. Same price_text contract that unblocked Steam. */
import { loadEnv } from "../src/env.ts";
import { createScraperAwaited, sanitizePrompt } from "../src/brightdata.ts";
import { addVariant, getTarget, getVariants } from "../src/db.ts";
import { MAX_DESCRIPTION, STRATEGY_CLAUSE_PUBLIC } from "../src/strategies.ts";
import { prisma } from "../src/prisma.ts";
import type { VariantStrategy } from "../src/types.ts";

loadEnv();
const STRATEGY = (process.argv[2] ?? "text-anchor") as VariantStrategy;

// price_text, not price: a typed number parser throws on anything it cannot turn into
// one and loses the whole row. Our own coercion handles "$99.99" and absence alike.
// The colour must be in the title or the several MICKE desks collapse into one row.
/**
 * The cents must be demanded explicitly.
 *
 * IKEA splits a price across separate DOM nodes — 99 in one, 99 in another — so the
 * css and structural variants both read only the integer node and returned 99 for a
 * $99.99 desk. They made the SAME mistake, agreed with each other, and outvoted the
 * one variant that read the visible text correctly. Correlated failure beats a vote,
 * so the prompt has to close the gap the vote cannot.
 */
const PROMPT = sanitizePrompt(
  "Extract two fields from this IKEA product page. price_text: the COMPLETE price " +
    'including cents, as a string, for example "$99.99" — IKEA splits the dollars and ' +
    "cents into separate elements, so join them; a whole-dollar price with no cents is " +
    "wrong. title: the full product name including colour or finish. Return both as strings. " +
    STRATEGY_CLAUSE_PUBLIC[STRATEGY]
).slice(0, MAX_DESCRIPTION);

async function main() {
  const target = await getTarget("ikea-desks");
  if (!target) throw new Error("run ikea-setup.ts first");
  if ((await getVariants(target.id)).some((v) => v.strategy === STRATEGY)) {
    console.log(`${STRATEGY} already present`);
    return prisma.$disconnect();
  }
  const seed = target.schema.urls![0];
  console.log(`building ${STRATEGY} against ${seed}\n  ${PROMPT}\n`);
  const t0 = Date.now();
  const { collectorId } = await createScraperAwaited(seed, PROMPT, (id) => console.log(`  accepted ${id}…`));
  await addVariant(target.id, collectorId, STRATEGY);
  console.log(`✔ READY ${collectorId} (${((Date.now() - t0) / 60000).toFixed(1)} min)`);
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error("✘", String(e).slice(0, 500)); await prisma.$disconnect(); process.exit(1); });
