import { createScraperAwaited } from "./brightdata.ts";
import { addVariant, getTarget, getVariants, retireVariants, upsertTarget } from "./db.ts";
import { appendJobLog, createJob, finishJob } from "./jobs.ts";
import { runCycle } from "./runner.ts";
import { STRATEGY_LABEL, strategyPrompts } from "./strategies.ts";
import type { TargetSchema, VariantStrategy } from "./types.ts";

/**
 * Kick off Flock creation as a background job and return its id immediately —
 * `scraper create` takes 5-25 minutes per variant, far past any HTTP timeout.
 */
export async function startFlockJob(
  name: string,
  url: string,
  schema: TargetSchema,
  opts: { replace?: boolean } = {}
): Promise<number> {
  const jobId = await createJob("flock", name);

  void (async () => {
    try {
      const target = await upsertTarget(name, url, schema);
      if (opts.replace) {
        const retired = await retireVariants(target.id);
        if (retired) await appendJobLog(jobId, `Retired ${retired} previous scraper(s); rebuilding the Flock.`);
      }
      const all = Object.entries(strategyPrompts(schema)) as [VariantStrategy, string][];

      // Only build strategies this target is missing, so a retry tops the Flock up
      // instead of discarding scrapers that already succeeded.
      const existing = new Set((await getVariants(target.id)).map((v) => v.strategy));
      const prompts = all.filter(([strategy]) => !existing.has(strategy));
      if (prompts.length === 0) {
        await appendJobLog(jobId, `Flock already complete (${all.length} scrapers). Nothing to build.`);
        return finishJob(jobId, "done");
      }
      if (existing.size > 0) {
        await appendJobLog(jobId, `${existing.size} scraper(s) already present; building the missing ${prompts.length}.`);
      }
      await appendJobLog(jobId, `Spinning up ${prompts.length} scraper(s) for ${url}`);
      await appendJobLog(jobId, `Bright Data generates each one with AI — 10-25 min. Stay online; the build aborts if this process dies.`);

      // The CLI drives generation rather than merely polling it, so each call must run
      // to completion. Variants build concurrently; only the id is reported early.
      const results = await Promise.allSettled(
        prompts.map(async ([strategy, prompt]) => {
          const t0 = Date.now();
          await appendJobLog(jobId, `→ ${STRATEGY_LABEL[strategy]} variant: building…`);
          const { collectorId } = await createScraperAwaited(url, prompt, (id) =>
            void appendJobLog(jobId, `   ${STRATEGY_LABEL[strategy]} collector ${id} accepted, generating…`)
          );
          await addVariant(target.id, collectorId, strategy);
          await appendJobLog(
            jobId,
            `✔ ${STRATEGY_LABEL[strategy]} READY — ${collectorId} (${((Date.now() - t0) / 60000).toFixed(1)} min)`
          );
          return collectorId;
        })
      );

      const ok = results.filter((r) => r.status === "fulfilled").length;
      for (const r of results) {
        if (r.status === "rejected") await appendJobLog(jobId, `✘ variant failed: ${String(r.reason).slice(0, 300)}`);
      }
      await appendJobLog(
        jobId,
        `Flock ready: ${ok}/${prompts.length} scrapers built and usable.`
      );
      if (ok === 0) await finishJob(jobId, "error", "no scrapers could be created");
      else await finishJob(jobId, "done");
    } catch (e) {
      await appendJobLog(jobId, `✘ ${String(e).slice(0, 400)}`);
      await finishJob(jobId, "error", String(e).slice(0, 500));
    }
  })();

  return jobId;
}

/** Run one full cycle (scrape → vote → heal losers) as a background job. */
export async function startRunJob(name: string, opts: { heal?: boolean } = {}): Promise<number> {
  const jobId = await createJob("run", name);

  void (async () => {
    try {
      const target = await getTarget(name);
      if (!target) throw new Error(`unknown target "${name}"`);
      await runCycle(target, { heal: opts.heal ?? true }, (msg) => void appendJobLog(jobId, msg));
      await finishJob(jobId, "done");
    } catch (e) {
      await appendJobLog(jobId, `✘ ${String(e).slice(0, 400)}`);
      await finishJob(jobId, "error", String(e).slice(0, 500));
    }
  })();

  return jobId;
}
