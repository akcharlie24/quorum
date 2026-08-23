import { test } from "node:test";
import assert from "node:assert/strict";
import { coerce, consensus, normalizeRows } from "../src/consensus.js";
import { scorePreview } from "../src/healer.js";
import { MAX_DESCRIPTION, strategyPrompts } from "../src/strategies.js";
import { classifyError, extractTruncatedCount, isInfrastructureFailure, sanitizePrompt } from "../src/brightdata.js";
import type { TargetSchema } from "../src/types.js";

const schema: TargetSchema = {
  keyField: "name",
  fields: { name: "string", price: "number", rating: "number", stock: "integer" },
};

const good = [
  { name: "Web-Shooter Mk II", price: 129.99, rating: 4.8, stock: 12 },
  { name: "Utility Belt Pro", price: 59.0, rating: 4.2, stock: 34 },
];

test("prompts stay inside Bright Data's undocumented description limit", () => {
  const fat: TargetSchema = {
    keyField: "name",
    fields: Object.fromEntries(
      Array.from({ length: 12 }, (_, i) => [`some_rather_long_field_name_${i}`, "string" as const])
    ),
    itemLabel: "product listing entry",
    description: "x".repeat(400),
  };
  for (const [strategy, prompt] of Object.entries(strategyPrompts(fat))) {
    assert.ok(prompt.length <= MAX_DESCRIPTION, `${strategy} prompt too long: ${prompt.length}`);
  }
  // the three must still differ, or the Flock is just one scraper three times
  const p = strategyPrompts({ keyField: "name", fields: { name: "string" }, itemLabel: "item" });
  assert.notEqual(p.css, p["text-anchor"]);
  assert.notEqual(p.css, p.structural);
  assert.notEqual(p["text-anchor"], p.structural);
  // each must steer at its own signal, or the Flock is one scraper run three times
  assert.match(p.css, /class names and element IDs/);
  assert.match(p["text-anchor"], /visible text labels/);
  assert.match(p.structural, /DOM structure/);
});

test("sanitizePrompt flattens smart punctuation to ASCII", () => {
  assert.equal(sanitizePrompt("price — the “best” value…"), 'price - the "best" value...');
  assert.ok(!/[^\x20-\x7E]/.test(sanitizePrompt("£51.77 · née")));
});

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

test("rows nested in a container key are recovered", () => {
  // shape a real IMDb collector returned: rows buried under `movies`, plus crawl metadata
  const wrapped = [
    {
      movies: [
        { title: "Seven", rating: 8.6 },
        { title: "Forrest Gump", rating: 8.8 },
      ],
      product_page_url: "https://www.imdb.com/title/tt0120815/",
      input: { url: "https://www.imdb.com/chart/top/" },
    },
  ];
  const movieSchema: TargetSchema = {
    keyField: "title",
    fields: { title: "string", rating: "number" },
  };
  const rows = normalizeRows(wrapped, movieSchema);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { title: "Seven", rating: 8.6 });
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

test("a value beats two nulls — absence is not evidence", () => {
  // Observed live on Steam: css read Stardew Valley at 14.99 while the other two
  // returned null, and majority rule shipped null. A null is a failed extraction,
  // not a claim, so it abstains.
  const found = [{ name: "Stardew Valley", price: 14.99, rating: 4.8, stock: 1 }];
  const blank = [{ name: "Stardew Valley", price: null, rating: 4.8, stock: 1 }];
  const res = consensus(
    [
      { variantId: 1, rows: normalizeRows(found, schema) },
      { variantId: 2, rows: normalizeRows(blank, schema) },
      { variantId: 3, rows: normalizeRows(blank, schema) },
    ],
    schema
  );
  assert.equal(res.rows[0].price, 14.99, "the found value must win over two nulls");
  // the scrapers that found nothing are still recorded as dissenting, so it shows up
  assert.equal(res.verdicts.find((v) => v.variantId === 1)!.status, "healthy");
  assert.ok(res.verdicts.filter((v) => v.status === "dissenting").length === 2);
});

test("reputation decides a 1-1 split instead of insertion order", () => {
  // Live on IKEA: one scraper read 99.99, another read 99 (it took only the dollars
  // element), and a third abstained. With equal weights the winner was whichever was
  // listed first — the right answer by luck. Track record must decide it.
  const right = [{ name: "MICKE Desk", price: 99.99, rating: 4, stock: 1 }];
  const truncated = [{ name: "MICKE Desk", price: 99, rating: 4, stock: 1 }];
  const blank = [{ name: "MICKE Desk", price: null, rating: 4, stock: 1 }];

  const vote = (weightRight: number, weightTruncated: number) =>
    consensus(
      [
        { variantId: 1, rows: normalizeRows(right, schema), weight: weightRight },
        { variantId: 2, rows: normalizeRows(truncated, schema), weight: weightTruncated },
        { variantId: 3, rows: normalizeRows(blank, schema), weight: 1 },
      ],
      schema
    ).rows[0].price;

  // the historically reliable scraper wins regardless of ordering
  assert.equal(vote(0.9, 0.3), 99.99);
  // and reputation genuinely drives it: flip the weights and the other value wins
  assert.equal(vote(0.3, 0.9), 99);
});

test("when nobody finds a value it stays null", () => {
  const blank = [{ name: "Dota 2", price: null, rating: 4.5, stock: 1 }];
  const res = consensus(
    [1, 2, 3].map((variantId) => ({ variantId, rows: normalizeRows(blank, schema) })),
    schema
  );
  assert.equal(res.rows[0].price, null);
  assert.ok(res.verdicts.every((v) => v.status === "healthy"), "unanimous absence is not dissent");
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

test("scorePreview: accurate preview scores high, corrupted low, empty zero", () => {
  const target = { id: 1, name: "t", url: "u", schema } as const;
  const consensusRows = normalizeRows(good, schema);
  assert.ok(scorePreview(good, consensusRows, target).precision > 0.95);
  const garbage = good.map((r) => ({ ...r, price: 0, stock: 999 }));
  assert.ok(scorePreview(garbage, consensusRows, target).precision < 0.9);
  assert.equal(scorePreview([], consensusRows, target).precision, 0);
});

test("scorePreview handles Bright Data's truncated previews", () => {
  // real shape: a couple of rows plus a literal "N more items" marker
  const movieSchema: TargetSchema = { keyField: "title", fields: { title: "string", rating: "number" } };
  const target = { id: 1, name: "imdb", url: "u", schema: movieSchema } as const;
  const consensusRows = normalizeRows(
    Array.from({ length: 250 }, (_, i) => ({ title: `Movie ${i}`, rating: 9 - i / 100 })),
    movieSchema
  );
  const preview = [
    { movies: [{ title: "Movie 0", rating: 9 }, { title: "Movie 1", rating: 8.99 }, "223 more items"] },
  ];

  const s = scorePreview(preview, consensusRows, target, extractTruncatedCount(preview));
  // precision is judged on the visible sample, not on the truncated total
  assert.equal(s.sampleRows, 2);
  assert.equal(s.precision, 1);
  assert.equal(s.claimedRows, 225);
  assert.ok(s.claimedRows >= consensusRows.length * 0.5, "225 of 250 clears the cardinality floor");

  // a fix that is accurate but returns almost nothing must not pass
  const stingy = [{ movies: [{ title: "Movie 0", rating: 9 }] }];
  const s2 = scorePreview(stingy, consensusRows, target, extractTruncatedCount(stingy));
  assert.equal(s2.precision, 1);
  assert.ok(s2.claimedRows < consensusRows.length * 0.5, "1 of 250 must fail the cardinality floor");
});

test("network failures are never treated as scraper breakage", () => {
  const netFail = {
    ok: false, exitCode: 1, json: null, timedOut: false,
    stdout: "Triggering scrape...\nWaiting for results...\n",
    stderr: "fetch failed (response_id d2t178741961)",
  };
  assert.equal(classifyError(netFail), "network");

  // A batch scrape we killed leaves no timeout text in the log at all — only the
  // kill flag distinguishes it from a genuine scraper failure.
  const killed = {
    ok: false, exitCode: 1, json: null, timedOut: true,
    stdout: "Submitting batch job...\nCollecting (batch)...\n", stderr: "",
  };
  assert.equal(classifyError(killed), "timeout");
  assert.ok(isInfrastructureFailure(`${classifyError(killed)}: Collecting (batch)...`));
  assert.ok(isInfrastructureFailure("network: fetch failed"));
  assert.ok(isInfrastructureFailure("rate_limited: 429"));
  // a genuine extraction fault must still be healable
  // a batch job we stopped waiting for is our impatience, not a scraper defect
  assert.ok(isInfrastructureFailure("timeout: Collecting (batch)..."));
  // running out of credit is a billing state, not a broken scraper
  const broke = { ok: false, exitCode: 1, json: null, timedOut: false, stdout: "",
    stderr: "Error: insufficient balance to run this collector" };
  assert.equal(classifyError(broke), "no_credit");
  assert.ok(isInfrastructureFailure("no_credit: insufficient balance"));
  assert.ok(!isInfrastructureFailure("schema-mismatch: 250 raw row(s)"));
  assert.ok(!isInfrastructureFailure("empty: scraper returned no rows"));
});
