/** Runs the ikea-desks flock and grades consensus against the known prices. */
import { loadEnv } from "../src/env.ts";
import { getTarget } from "../src/db.ts";
import { runCycle } from "../src/runner.ts";
import { prisma } from "../src/prisma.ts";
import { EXPECTED } from "./ikea-setup.ts";

loadEnv();

async function main() {
  const target = await getTarget("ikea-desks");
  if (!target) throw new Error("run ikea-setup.ts first");
  const res = await runCycle(target, { heal: false });

  const expected = Object.values(EXPECTED);
  console.log(`\n=== consensus (${res.consensus.rows.length} rows) ===`);
  let matched = 0;
  for (const r of res.consensus.rows) {
    const price = r.price as number | null;
    // Grade by value: titles differ in wording, but a correct price must appear in the
    // known set — that is enough to say the extraction landed on a real number.
    const ok = price !== null && expected.some((e) => Math.abs(e - price) < 0.011);
    if (ok) matched++;
    console.log(`  ${ok ? "✔" : "·"} ${String(r.title).slice(0, 46).padEnd(46)} ${price ?? "—"}`);
  }
  console.log(`\n${matched}/${res.consensus.rows.length} prices match a known IKEA price`);
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error("✘", String(e).slice(0, 500)); await prisma.$disconnect(); process.exit(1); });
