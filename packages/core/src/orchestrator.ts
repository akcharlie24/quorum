import { createScraperDetached } from "./brightdata.js";
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

      // Detached: we record each collector id the moment Bright Data accepts the build,
      // then let it generate server-side. Nothing here depends on staying connected.
      const results = await Promise.allSettled(
        prompts.map(async ([strategy, prompt]) => {
          appendJobLog(jobId, `→ ${STRATEGY_LABEL[strategy]} variant: submitting…`);
          const { collectorId } = await createScraperDetached(url, prompt);
          addVariant(target.id, collectorId, strategy);
          appendJobLog(jobId, `✔ ${STRATEGY_LABEL[strategy]} accepted — ${collectorId} (building on Bright Data)`);
          return collectorId;
        })
      );

      const ok = results.filter((r) => r.status === "fulfilled").length;
      for (const r of results) {
        if (r.status === "rejected") appendJobLog(jobId, `✘ variant failed: ${String(r.reason).slice(0, 300)}`);
      }
      appendJobLog(
        jobId,
        `${ok}/${prompts.length} scrapers accepted. Bright Data is generating them now (~10-25 min); ` +
          `run a cycle once they finish to bring the Flock online.`
      );
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
