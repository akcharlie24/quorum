/**
 * Seeds a fully-populated Flock into the database WITHOUT calling Bright Data.
 * Used to develop and demo the UI while real scrapers are being built.
 *   npx tsx packages/core/src/seed-demo.ts
 */
import {
  addVariant,
  decideHealEvent,
  finishRun,
  getVariants,
  prisma,
  recordVariantResult,
  recordVote,
  startHealEvent,
  startRun,
  upsertTarget,
} from "./db.ts";
import { consensus, normalizeRows } from "./consensus.ts";
import { runSentry } from "./sentry.ts";
import type { TargetSchema } from "./types.ts";

const schema: TargetSchema = {
  keyField: "name",
  fields: { name: "string", price: "number", rating: "number", stock: "integer" },
  itemLabel: "product",
};

const PRODUCTS = [
  { name: "Web-Shooter Mk II", price: 129.99, rating: 4.8, stock: 12 },
  { name: "Spidey Suit Classic", price: 249.5, rating: 4.9, stock: 5 },
  { name: "Utility Belt Pro", price: 59.0, rating: 4.2, stock: 34 },
  { name: "Wall-Crawl Gloves", price: 89.95, rating: 4.5, stock: 21 },
  { name: "Spider-Tracer 6-Pack", price: 19.99, rating: 3.9, stock: 120 },
  { name: "Daily Bugle Press Pass", price: 9.5, rating: 4.0, stock: 77 },
];

const NAME = "seed-demo-store";

async function main() {
  // wipe any previous seed so re-running is idempotent
  const old = await prisma.target.findUnique({ where: { name: NAME } });
  if (old) {
    await prisma.vote.deleteMany({ where: { run: { target_id: old.id } } });
    await prisma.variantResult.deleteMany({ where: { run: { target_id: old.id } } });
    await prisma.healEvent.deleteMany({ where: { variant: { target_id: old.id } } });
    await prisma.run.deleteMany({ where: { target_id: old.id } });
    await prisma.variant.deleteMany({ where: { target_id: old.id } });
    await prisma.target.delete({ where: { id: old.id } });
  }

  const target = await upsertTarget(NAME, "https://webhead-gear.example.com", schema);
  await addVariant(target.id, "c_seed_css01", "css");
  await addVariant(target.id, "c_seed_txt02", "text-anchor");
  await addVariant(target.id, "c_seed_dom03", "structural");
  const [css, text, struct] = await getVariants(target.id);

  async function cycle(rowsPerVariant: Record<number, typeof PRODUCTS>) {
    const runId = await startRun(target.id);
    const res = consensus(
      Object.entries(rowsPerVariant).map(([id, rows]) => ({
        variantId: Number(id),
        rows: normalizeRows(rows, schema),
      })),
      schema
    );
    for (const v of res.verdicts) await recordVariantResult(runId, v.variantId, v.status, v.rows, v.error, v.dissents);
    for (const vote of res.votes) await recordVote(runId, vote.rowKey, vote.field, vote.consensusValue, vote.dissenting);
    await finishRun(runId, res.rows);
    // Seeded runs go through the sentry exactly as real ones do, so the demo store
    // exercises the same code path rather than a hand-written alert.
    await runSentry(target, runId, res.rows, res.verdicts.map((v) => v.status), () => {});
    return { runId, res };
  }

  // three clean cycles
  for (let i = 0; i < 3; i++) {
    await cycle({ [css.id]: PRODUCTS, [text.id]: PRODUCTS, [struct.id]: PRODUCTS });
  }

  // the site "redesigns": the CSS variant starts reading prices as 0 (silent corruption)
  const corrupted = PRODUCTS.map((p) => ({ ...p, price: 0 }));
  const broken = await cycle({ [css.id]: corrupted, [text.id]: PRODUCTS, [struct.id]: PRODUCTS });

  // heal: first attempt rejected, second approved
  const h1 = await startHealEvent(
    css.id,
    broken.runId,
    "The scraper returns wrong values for field(s) price on https://webhead-gear.example.com. Correct example item: name=\"Web-Shooter Mk II\", price=129.99, rating=4.8, stock=12. Fix extraction for those fields; keep the same output field names."
  );
  await decideHealEvent(h1, "rejected", "preview matched consensus at only 62.5% (< 90%)", corrupted);

  const h2 = await startHealEvent(
    css.id,
    broken.runId,
    "The previous fix was wrong. The correct current data for the first items is exactly: " +
      JSON.stringify(PRODUCTS.slice(0, 3)) +
      ". Return items matching this shape and these values."
  );
  await decideHealEvent(h2, "approved", "preview matched consensus at 100.0%", PRODUCTS);

  // post-heal: everyone healthy again
  await cycle({ [css.id]: PRODUCTS, [text.id]: PRODUCTS, [struct.id]: PRODUCTS });

  /**
   * The failure the vote cannot see.
   *
   * Above, ONE scraper read 0 and the other two outvoted it — that is Layer 2 working.
   * Here the SITE serves 0 (the Breakage Lab's v3 layout), so all three scrapers agree
   * and every one of them is right about what the page says and wrong about the world.
   * Consensus is unanimous, every card is green, and the pipeline ships zeroes.
   *
   * Only Spider-Sense sees it, because it is the only check that compares this run
   * against the target's own history instead of against its peers.
   */
  const siteServesZero = PRODUCTS.map((p) => ({ ...p, price: 0 }));
  await cycle({ [css.id]: siteServesZero, [text.id]: siteServesZero, [struct.id]: siteServesZero });

  console.log(
    `Seeded "${NAME}" — 6 runs, 1 silent breakage caught by the vote, 1 rejected fix, ` +
      `1 approved fix, 1 fleet-wide price collapse only Spider-Sense can see.`
  );
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
