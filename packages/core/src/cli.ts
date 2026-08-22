#!/usr/bin/env tsx
import pc from "picocolors";
import { loadEnv } from "./env.js";
import { createScraper } from "./brightdata.js";
import {
  addVariant,
  allTargets,
  getTarget,
  getVariants,
  lastRuns,
  pendingHeals,
  upsertTarget,
} from "./db.js";
import { runCycle } from "./runner.js";
import { strategyPrompts } from "./strategies.js";
import type { TargetSchema, VariantStrategy } from "./types.js";

loadEnv();

const DEFAULT_SCHEMA: TargetSchema = {
  keyField: "name",
  fields: { name: "string", price: "number", rating: "number", stock: "integer" },
  itemLabel: "product",
};

const [, , cmd, ...args] = process.argv;

function usage(): never {
  console.log(`
${pc.bold("silk")} — the immune system for web scrapers

  silk flock <url> <name>     create 3 scraper variants (css / text-anchor / structural)
  silk run <name>             one cycle: run variants -> consensus -> heal losers
  silk run <name> --no-heal   cycle without healing (observe only)
  silk watch <name> [sec]     loop run every [sec] seconds (default 120)
  silk status                 targets, variants, recent runs, pending heals
`);
  process.exit(1);
}

async function main() {
  switch (cmd) {
    case "flock": {
      const [url, name] = args;
      if (!url || !name) usage();
      const target = upsertTarget(name, url, DEFAULT_SCHEMA);
      console.log(pc.bold(`Creating flock for ${name} (${url}) — 3 variants, 5-25 min each, running in parallel…`));
      const entries = Object.entries(strategyPrompts(DEFAULT_SCHEMA)) as [VariantStrategy, string][];
      const results = await Promise.allSettled(
        entries.map(async ([strategy, prompt]) => {
          const t0 = Date.now();
          const { collectorId } = await createScraper(url, prompt);
          addVariant(target.id, collectorId, strategy);
          const mins = ((Date.now() - t0) / 60000).toFixed(1);
          console.log(pc.green(`  ✔ ${strategy}: ${collectorId} (${mins} min)`));
          return collectorId;
        })
      );
      const failed = results.filter((r) => r.status === "rejected");
      for (const f of failed) console.error(pc.red(`  ✘ ${(f as PromiseRejectedResult).reason}`));
      console.log(failed.length === 0 ? pc.bold(pc.green("Flock ready.")) : pc.yellow(`${3 - failed.length}/3 variants created.`));
      break;
    }

    case "run": {
      const name = args[0];
      if (!name) usage();
      const target = getTarget(name);
      if (!target) { console.error(pc.red(`unknown target "${name}"`)); process.exit(1); }
      const heal = !args.includes("--no-heal");
      const res = await runCycle(target, { heal });
      if (res.healed > 0) console.log(pc.bold(pc.green(`\n${res.healed} variant(s) healed and consensus-approved this cycle.`)));
      break;
    }

    case "watch": {
      const name = args[0];
      if (!name) usage();
      const target = getTarget(name);
      if (!target) { console.error(pc.red(`unknown target "${name}"`)); process.exit(1); }
      const interval = Number(args[1] ?? 120) * 1000;
      console.log(pc.bold(`👁  watching ${name} every ${interval / 1000}s — Ctrl+C to stop`));
      // sequential loop (never overlap cycles)
      for (;;) {
        try {
          await runCycle(target);
        } catch (e) {
          console.error(pc.red(String(e)));
        }
        await new Promise((r) => setTimeout(r, interval));
      }
    }

    case "status": {
      for (const t of allTargets()) {
        console.log(pc.bold(`\n${t.name}  ${pc.dim(t.url)}`));
        for (const v of getVariants(t.id)) {
          console.log(`  ${v.strategy.padEnd(12)} ${v.collector_id}`);
        }
        for (const r of lastRuns(t.id, 5) as { id: number; started_at: string; consensus_json: string | null }[]) {
          const rows = r.consensus_json ? JSON.parse(r.consensus_json).length : 0;
          console.log(pc.dim(`  run #${r.id} ${r.started_at} — ${rows} consensus rows`));
        }
      }
      const pending = pendingHeals();
      if (pending.length) console.log(pc.yellow(`\n${pending.length} heal(s) pending`));
      break;
    }

    default:
      usage();
  }
}

main().catch((e) => {
  console.error(pc.red(String(e?.stack ?? e)));
  process.exit(1);
});
