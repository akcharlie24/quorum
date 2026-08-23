/** Runs the steam-prices Flock through the normal cycle and prints the consensus table. */
import { loadEnv } from "../src/env.ts";
import { getTarget } from "../src/db.ts";
import { runCycle } from "../src/runner.ts";
import { prisma } from "../src/prisma.ts";

loadEnv();

async function main() {
  const target = await getTarget("steam-prices");
  if (!target) throw new Error("run steam-setup.ts first");
  const res = await runCycle(target, { heal: false });
  console.log(`\n=== consensus (${res.consensus.rows.length} rows) ===`);
  for (const r of res.consensus.rows) console.log("  %s", JSON.stringify(r));
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error("✘", String(e).slice(0, 600)); await prisma.$disconnect(); process.exit(1); });
