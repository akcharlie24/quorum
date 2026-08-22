import { createScraperAwaited } from "./brightdata.js";
import { addVariant, getTarget, getVariants, retireVariants, upsertTarget } from "./db.js";
import { appendJobLog, createJob, finishJob } from "./jobs.js";
import { runCycle } from "./runner.js";
import { STRATEGY_LABEL, strategyPrompts } from "./strategies.js";
import type { TargetSchema, VariantStrategy } from "./types.js";

/**
 * Kick off Flock creation as a background job and return its id immediately —
 * `scraper create` takes 5-25 minutes per variant, far past any HTTP timeout.
 */
export function startFlockJob(
  name: string,
  url: string,
  schema: TargetSchema,
  opts: { replace?: boolean } = {}
): number {
  const jobId = createJob("flock", name);

  void (async () => {
    try {
      const target = upsertTarget(name, url, schema);
      if (opts.replace) {
        const retired = retireVariants(target.id);
        if (retired) appendJobLog(jobId, `Retired ${retired} previous scraper(s); rebuilding the Flock.`);
      }
      const all = Object.entries(strategyPrompts(schema)) as [VariantStrategy, string][];

      // Only build strategies this target is missing, so a retry tops the Flock up
      // instead of discarding scrapers that already succeeded.
      const existing = new Set(getVariants(target.id).map((v) => v.strategy));
      const prompts = all.filter(([strategy]) => !existing.has(strategy));
      if (prompts.length === 0) {
        appendJobLog(jobId, `Flock already complete (${all.length} scrapers). Nothing to build.`);
        return finishJob(jobId, "done");
      }
      if (existing.size > 0) {
        appendJobLog(jobId, `${existing.size} scraper(s) already present; building the missing ${prompts.length}.`);
      }
      appendJobLog(jobId, `Spinning up ${prompts.length} scraper(s) for ${url}`);
      appendJobLog(jobId, `Bright Data generates each one with AI — 10-25 min. Stay online; the build aborts if this process dies.`);

      // The CLI drives generation rather than merely polling it, so each call must run
      // to completion. Variants build concurrently; only the id is reported early.
      const results = await Promise.allSettled(
        prompts.map(async ([strategy, prompt]) => {
          const t0 = Date.now();
          appendJobLog(jobId, `→ ${STRATEGY_LABEL[strategy]} variant: building…`);
          const { collectorId } = await createScraperAwaited(url, prompt, (id) =>
            appendJobLog(jobId, `   ${STRATEGY_LABEL[strategy]} collector ${id} accepted, generating…`)
          );
          addVariant(target.id, collectorId, strategy);
          appendJobLog(
            jobId,
            `✔ ${STRATEGY_LABEL[strategy]} READY — ${collectorId} (${((Date.now() - t0) / 60000).toFixed(1)} min)`
          );
          return collectorId;
        })
      );

      const ok = results.filter((r) => r.status === "fulfilled").length;
      for (const r of results) {
        if (r.status === "rejected") appendJobLog(jobId, `✘ variant failed: ${String(r.reason).slice(0, 300)}`);
      }
      appendJobLog(
        jobId,
        `Flock ready: ${ok}/${prompts.length} scrapers built and usable.`
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
