/**
 * Replays Spider-Sense over every run already in the database.
 *
 * Drift is computed from stored consensus datasets, so this costs no Bright Data credits
 * and needs no scraping — it simply asks, of history we already paid for, "what would the
 * sentry have said?". Running it gives the console real drift history immediately.
 *
 *   npx tsx packages/core/scripts/backfill-drift.ts [target-name] [--reset]
 */
import pc from "picocolors";
import { loadEnv } from "../src/env.ts";
import { prisma } from "../src/prisma.ts";
import { backfillTarget } from "../src/sentry.ts";
import type { TargetSchema } from "../src/types.ts";

loadEnv();

const RESET = process.argv.includes("--reset");
const only = process.argv.slice(2).find((a) => !a.startsWith("--"));

async function main() {
  const targets = await prisma.target.findMany({
    where: only ? { name: only } : undefined,
    orderBy: { id: "asc" },
  });
  if (targets.length === 0) throw new Error(only ? `no target named "${only}"` : "no targets");

  console.log(pc.bold(`\n◈ Spider-Sense backfill — ${targets.length} target(s)${RESET ? " (reset)" : ""}\n`));
  for (const t of targets) {
    await backfillTarget(
      { id: t.id, name: t.name, url: t.url, schema: JSON.parse(t.schema_json) as TargetSchema },
      RESET
    );
  }

  const open = await prisma.driftAlert.findMany({
    where: { resolved_at: null },
    include: { target: { select: { name: true } } },
    orderBy: [{ severity: "asc" }, { id: "desc" }],
  });
  console.log(pc.bold(`\n${open.length} signal(s) currently open:\n`));
  for (const a of open) {
    const mark = a.severity === "critical" ? pc.red("◆") : a.severity === "warn" ? pc.yellow("◈") : pc.dim("◇");
    console.log(`  ${mark} ${a.target.name.padEnd(16)} ${(a.field ?? "dataset").padEnd(12)} ${a.detail}`);
    if (a.fleet_wide) console.log(pc.red(`      every scraper agreed — the vote could not have caught it`));
  }
  console.log();
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
