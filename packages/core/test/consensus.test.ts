import { test } from "node:test";
import assert from "node:assert/strict";
import { coerce, consensus, normalizeRows } from "../src/consensus.js";
import { previewMatchScore } from "../src/healer.js";
import type { TargetSchema } from "../src/types.js";

const schema: TargetSchema = {
  keyField: "name",
  fields: { name: "string", price: "number", rating: "number", stock: "integer" },
};

const good = [
  { name: "Web-Shooter Mk II", price: 129.99, rating: 4.8, stock: 12 },
  { name: "Utility Belt Pro", price: 59.0, rating: 4.2, stock: 34 },
];

test("coerce strips currency and labels", () => {
  assert.equal(coerce("$129.99", "number"), 129.99);
  assert.equal(coerce("In stock: 12", "integer"), 12);
  assert.equal(coerce("Rating: 4.8 / 5", "number"), 4.8);
  assert.equal(coerce(undefined, "number"), null);
});

test("coerce unwraps Bright Data's structured values", () => {
  // real shape observed from a live collector: price arrives as an object
  assert.equal(coerce({ value: 51.77, currency: "GBP", symbol: "£" }, "number"), 51.77);
  assert.equal(coerce({ text: "In stock (22 available)" }, "integer"), 22);
  assert.equal(coerce({ currency: "GBP" }, "string"), "GBP");
  assert.equal(coerce([{ value: 9.5 }], "number"), 9.5);
  assert.equal(coerce({}, "number"), null);
});

test("a wrapped value and a bare value are treated as agreeing", () => {
  const wrapped = [{ name: "Widget", price: { value: 10, currency: "USD" }, rating: 4, stock: 2 }];
  const bare = [{ name: "Widget", price: 10, rating: 4, stock: 2 }];
  const res = consensus(
    [
      { variantId: 1, rows: normalizeRows(wrapped, schema) },
      { variantId: 2, rows: normalizeRows(bare, schema) },
      { variantId: 3, rows: normalizeRows(bare, schema) },
    ],
    schema
  );
  assert.ok(res.verdicts.every((v) => v.status === "healthy"));
});

test("normalizeRows maps aliased field names", () => {
  const rows = normalizeRows(
    [{ product_name: "X", Price: "$5.00", rating: "4.0", product_stock: "7 units" }],
    schema
  );
  assert.deepEqual(rows[0], { name: "X", price: 5, rating: 4, stock: 7 });
});

test("all agree -> all healthy, consensus = data", () => {
  const res = consensus(
    [1, 2, 3].map((variantId) => ({ variantId, rows: normalizeRows(good, schema) })),
    schema
  );
  assert.equal(res.rows.length, 2);
  assert.ok(res.verdicts.every((v) => v.status === "healthy"));
  assert.equal(res.votes.length, 0);
});

test("one variant with wrong prices -> dissenting, consensus keeps truth", () => {
  const corrupted = good.map((r) => ({ ...r, price: 0 }));
  const res = consensus(
    [
      { variantId: 1, rows: normalizeRows(good, schema) },
      { variantId: 2, rows: normalizeRows(good, schema) },
      { variantId: 3, rows: normalizeRows(corrupted, schema) },
    ],
    schema
  );
  assert.equal(res.verdicts.find((v) => v.variantId === 3)!.status, "dissenting");
  assert.equal(res.rows.find((r) => r.name === "web-shooter mk ii" || String(r.name).includes("Web-Shooter"))!.price, 129.99);
  assert.equal(res.votes.length, 2); // price disputed on both rows
});

test("one variant errors -> broken, consensus intact from survivors", () => {
  const res = consensus(
    [
      { variantId: 1, rows: normalizeRows(good, schema) },
      { variantId: 2, rows: normalizeRows(good, schema) },
      { variantId: 3, rows: [], error: "selector not found" },
    ],
    schema
  );
  assert.equal(res.verdicts.find((v) => v.variantId === 3)!.status, "broken");
  assert.equal(res.rows.length, 2);
});

test("numeric tolerance: 129.99 vs 129.985 agree", () => {
  const almost = good.map((r) => ({ ...r, price: r.price === 129.99 ? 129.985 : r.price }));
  const res = consensus(
    [
      { variantId: 1, rows: normalizeRows(good, schema) },
      { variantId: 2, rows: normalizeRows(almost, schema) },
      { variantId: 3, rows: normalizeRows(good, schema) },
    ],
    schema
  );
  assert.ok(res.verdicts.every((v) => v.status === "healthy"));
});

test("previewMatchScore: perfect preview ~1, garbage preview ~0", () => {
  const target = { id: 1, name: "t", url: "u", schema } as const;
  const consensusRows = normalizeRows(good, schema);
  assert.ok(previewMatchScore(good, consensusRows, target) > 0.95);
  const garbage = good.map((r) => ({ ...r, price: 0, stock: 999 }));
  assert.ok(previewMatchScore(garbage, consensusRows, target) < 0.9);
  assert.equal(previewMatchScore([], consensusRows, target), 0);
});
