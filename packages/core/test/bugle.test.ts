import { test } from "node:test";
import assert from "node:assert/strict";
import { VOLATILITY_WEIGHTS, volatilityScore, type VolatilityParts } from "../src/volatility.ts";

const parts = (p: Partial<VolatilityParts> = {}): VolatilityParts => ({
  breakageRate: 0,
  disputeRate: 0,
  driftPerRun: 0,
  healsPerRun: 0,
  ...p,
});

test("a site that never moved scores zero", () => {
  assert.equal(volatilityScore(parts()), 0);
});

test("a site that breaks something every cycle scores 100", () => {
  assert.equal(
    volatilityScore(parts({ breakageRate: 1, disputeRate: 1, driftPerRun: 1, healsPerRun: 1 })),
    100
  );
});

test("breakage outranks disputes at equal magnitude", () => {
  const breaking = volatilityScore(parts({ breakageRate: 0.5 }));
  const disputing = volatilityScore(parts({ disputeRate: 0.5 }));
  assert.ok(breaking > disputing, `${breaking} should exceed ${disputing}`);
});

test("silent drift outranks disputes the vote resolved on its own", () => {
  assert.ok(volatilityScore(parts({ driftPerRun: 0.5 })) > volatilityScore(parts({ disputeRate: 0.5 })));
});

test("rates above one per run cannot push the score past 100", () => {
  // A run can raise several signals; unclamped that would produce a score of 250.
  const score = volatilityScore(parts({ driftPerRun: 5, healsPerRun: 4, breakageRate: 1, disputeRate: 1 }));
  assert.equal(score, 100);
});

test("weights sum to the top of the scale", () => {
  const total = Object.values(VOLATILITY_WEIGHTS).reduce((a, b) => a + b, 0);
  assert.equal(total, 100);
});
