/**
 * Seeds a fully-populated Flock into the database WITHOUT calling Bright Data.
 * Used to develop and demo the UI while real scrapers are being built.
 *   npx tsx packages/core/src/seed-demo.ts
 */
import {
  addVariant,
  db,
  decideHealEvent,
  finishRun,
  getVariants,
  recordVariantResult,
  recordVote,
  startHealEvent,
  startRun,
  upsertTarget,
} from "./db.ts";
import { consensus, normalizeRows } from "./consensus.ts";
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

// wipe any previous seed so re-running is idempotent
const old = db.prepare(`SELECT id FROM targets WHERE name = ?`).get(NAME) as { id: number } | undefined;
if (old) {
  db.exec(`
    DELETE FROM votes WHERE run_id IN (SELECT id FROM runs WHERE target_id = ${old.id});
    DELETE FROM variant_results WHERE run_id IN (SELECT id FROM runs WHERE target_id = ${old.id});
    DELETE FROM heal_events WHERE variant_id IN (SELECT id FROM variants WHERE target_id = ${old.id});
    DELETE FROM runs WHERE target_id = ${old.id};
    DELETE FROM variants WHERE target_id = ${old.id};
    DELETE FROM targets WHERE id = ${old.id};
  `);
}

const target = upsertTarget(NAME, "https://webhead-gear.example.com", schema);
addVariant(target.id, "c_seed_css01", "css");
addVariant(target.id, "c_seed_txt02", "text-anchor");
addVariant(target.id, "c_seed_dom03", "structural");
const [css, text, struct] = getVariants(target.id);

function cycle(rowsPerVariant: Record<number, typeof PRODUCTS>) {
  const runId = startRun(target.id);
  const res = consensus(
    Object.entries(rowsPerVariant).map(([id, rows]) => ({
      variantId: Number(id),
      rows: normalizeRows(rows, schema),
    })),
    schema
  );
  for (const v of res.verdicts) recordVariantResult(runId, v.variantId, v.status, v.rows, v.error, v.dissents);
  for (const vote of res.votes) recordVote(runId, vote.rowKey, vote.field, vote.consensusValue, vote.dissenting);
  finishRun(runId, res.rows);
  return { runId, res };
}

// three clean cycles
for (let i = 0; i < 3; i++) {
  cycle({ [css.id]: PRODUCTS, [text.id]: PRODUCTS, [struct.id]: PRODUCTS });
}

// the site "redesigns": the CSS variant starts reading prices as 0 (silent corruption)
const corrupted = PRODUCTS.map((p) => ({ ...p, price: 0 }));
const broken = cycle({ [css.id]: corrupted, [text.id]: PRODUCTS, [struct.id]: PRODUCTS });

// heal: first attempt rejected, second approved
const h1 = startHealEvent(
  css.id,
  broken.runId,
  "The scraper returns wrong values for field(s) price on https://webhead-gear.example.com. Correct example item: name=\"Web-Shooter Mk II\", price=129.99, rating=4.8, stock=12. Fix extraction for those fields; keep the same output field names."
);
decideHealEvent(h1, "rejected", "preview matched consensus at only 62.5% (< 90%)", corrupted);

const h2 = startHealEvent(
  css.id,
  broken.runId,
  "The previous fix was wrong. The correct current data for the first items is exactly: " +
    JSON.stringify(PRODUCTS.slice(0, 3)) +
    ". Return items matching this shape and these values."
);
decideHealEvent(h2, "approved", "preview matched consensus at 100.0%", PRODUCTS);

// post-heal: everyone healthy again
cycle({ [css.id]: PRODUCTS, [text.id]: PRODUCTS, [struct.id]: PRODUCTS });

console.log(`Seeded "${NAME}" — 5 runs, 1 silent breakage, 1 rejected fix, 1 approved fix.`);
