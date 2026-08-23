import { test } from "node:test";
import assert from "node:assert/strict";
import { alertKey, detectDrift, diffAlerts, fingerprint, isFleetWide } from "../src/drift.ts";
import type { DriftAlert, DriftKind } from "../src/drift.ts";
import type { Row, TargetSchema } from "../src/types.ts";

const schema: TargetSchema = {
  keyField: "title",
  fields: { title: "string", price: "number" },
  itemLabel: "game",
};

const healthy = (n: number): Row[] =>
  Array.from({ length: n }, (_, i) => ({ title: `Game ${i}`, price: 10 + i }));

const history = [healthy(50), healthy(52), healthy(48)].map((r) => fingerprint(r, schema));

test("a steady target raises nothing", () => {
  assert.deepEqual(detectDrift(fingerprint(healthy(51), schema), history), []);
});

test("too little history judges nothing", () => {
  assert.deepEqual(detectDrift(fingerprint(healthy(1), schema), history.slice(0, 1)), []);
});

test("prices silently collapsing to zero is critical", () => {
  // the failure consensus cannot see: every scraper agrees, and all of them are wrong
  const corrupted = healthy(50).map((r) => ({ ...r, price: 0 }));
  const alerts = detectDrift(fingerprint(corrupted, schema), history);
  const collapse = alerts.find((a) => a.kind === "value_collapse");
  assert.ok(collapse, "expected value_collapse");
  assert.equal(collapse!.field, "price");
  assert.equal(collapse!.severity, "critical");
});

test("a field going entirely blank is critical", () => {
  // exactly what IMDb's css variant did: rows present, titles all empty
  const blank = healthy(50).map((r) => ({ ...r, title: "" }));
  const alerts = detectDrift(fingerprint(blank, schema), history);
  const vanished = alerts.find((a) => a.kind === "field_vanished");
  assert.ok(vanished, "expected field_vanished");
  assert.equal(vanished!.severity, "critical");
});

test("losing most rows is flagged", () => {
  const alerts = detectDrift(fingerprint(healthy(5), schema), history);
  assert.ok(alerts.some((a) => a.kind === "row_count_drop"));
});

test("an empty dataset is critical, not merely a drop", () => {
  const alerts = detectDrift(fingerprint([], schema), history);
  const drop = alerts.find((a) => a.kind === "row_count_drop");
  assert.equal(drop!.severity, "critical");
});

test("a genuine price rise is a shift, not a collapse", () => {
  const raised = healthy(50).map((r) => ({ ...r, price: Number(r.price) + 500 }));
  const alerts = detectDrift(fingerprint(raised, schema), history);
  assert.ok(alerts.some((a) => a.kind === "distribution_shift"));
  assert.ok(!alerts.some((a) => a.kind === "value_collapse"));
});

test("unanimous variants mean the site moved, not the scrapers", () => {
  assert.equal(isFleetWide(["healthy", "healthy", "healthy"]), true);
  assert.equal(isFleetWide(["healthy", "healthy", "broken"]), false);
});

// — dedupe: an alert is news once, not every cycle ————————————————————

const alert = (field: string | null, kind: DriftKind): DriftAlert => ({
  field,
  kind,
  severity: "warn",
  detail: "x",
  baseline: 1,
  current: 0,
});

test("a signal that is still firing does not re-open", () => {
  const fired = [alert("price", "null_spike")];
  const { opened, resolvedKeys } = diffAlerts(["price:null_spike"], fired);
  assert.equal(opened.length, 0);
  assert.deepEqual(resolvedKeys, []);
});

test("a signal that stops firing resolves", () => {
  const { opened, resolvedKeys } = diffAlerts(["price:null_spike"], []);
  assert.equal(opened.length, 0);
  assert.deepEqual(resolvedKeys, ["price:null_spike"]);
});

test("a different kind on the same field is a separate alert", () => {
  const { opened, resolvedKeys } = diffAlerts(["price:null_spike"], [
    alert("price", "null_spike"),
    alert("price", "value_collapse"),
  ]);
  assert.deepEqual(opened.map(alertKey), ["price:value_collapse"]);
  assert.deepEqual(resolvedKeys, []);
});

test("whole-dataset signals get their own key", () => {
  assert.equal(alertKey(alert(null, "row_count_drop")), "*:row_count_drop");
  assert.notEqual(alertKey(alert(null, "row_count_drop")), alertKey(alert("price", "row_count_drop")));
});
