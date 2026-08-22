import { createScraper } from "./brightdata.js";
import { addVariant, getTarget, upsertTarget } from "./db.js";
import { appendJobLog, createJob, finishJob } from "./jobs.js";
import { runCycle } from "./runner.js";
import { STRATEGY_LABEL, strategyPrompts } from "./strategies.js";
import type { TargetSchema, VariantStrategy } from "./types.js";

/**
 * Kick off Flock creation as a background job and return its id immediately —
 * `scraper create` takes 5-25 minutes per variant, far past any HTTP timeout.
 */
export function startFlockJob(name: string, url: string, schema: TargetSchema): number {
  const jobId = createJob("flock", name);

  void (async () => {
    try {
      const target = upsertTarget(name, url, schema);
      const prompts = Object.entries(strategyPrompts(schema)) as [VariantStrategy, string][];
      appendJobLog(jobId, `Spinning up a Flock of ${prompts.length} scrapers for ${url}`);
      appendJobLog(jobId, `Bright Data builds each scraper with AI — typically 5-15 min, up to 25 for complex pages.`);

      const results = await Promise.allSettled(
        prompts.map(async ([strategy, prompt]) => {
          const t0 = Date.now();
          appendJobLog(jobId, `→ ${STRATEGY_LABEL[strategy]} variant: submitted to Bright Data…`);
          const { collectorId } = await createScraper(url, prompt);
          addVariant(target.id, collectorId, strategy);
          appendJobLog(
            jobId,
            `✔ ${STRATEGY_LABEL[strategy]} variant ready — ${collectorId} (${((Date.now() - t0) / 60000).toFixed(1)} min)`
          );
          return collectorId;
        })
      );

      const ok = results.filter((r) => r.status === "fulfilled").length;
      for (const r of results) {
        if (r.status === "rejected") appendJobLog(jobId, `✘ variant failed: ${String(r.reason).slice(0, 300)}`);
      }
      appendJobLog(jobId, `Flock ready: ${ok}/${prompts.length} scrapers active.`);
      if (ok === 0) finishJob(jobId, "error", "no scrapers could be created");
      else finishJob(jobId, "done");
    } catch (e) {
      appendJobLog(jobId, `✘ ${String(e).slice(0, 400)}`);
      finishJob(jobId, "error", String(e).slice(0, 500));
    }
  })();

  return jobId;
}

/** Run one full cycle (scrape → vote → heal losers) as a background job. */
export function startRunJob(name: string, opts: { heal?: boolean } = {}): number {
  const jobId = createJob("run", name);

  void (async () => {
    try {
      const target = getTarget(name);
      if (!target) throw new Error(`unknown target "${name}"`);
      await runCycle(target, { heal: opts.heal ?? true }, (msg) => appendJobLog(jobId, msg));
      finishJob(jobId, "done");
    } catch (e) {
      appendJobLog(jobId, `✘ ${String(e).slice(0, 400)}`);
      finishJob(jobId, "error", String(e).slice(0, 500));
    }
  })();

  return jobId;
}
