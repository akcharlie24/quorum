"use client";

import type { DriftAlertView } from "@silk/core";

/**
 * Spider-Sense signals, said in words rather than enum names. The kind is the finding;
 * the alert's own `detail` carries the numbers.
 */
const DRIFT_MEANING: Record<string, string> = {
  row_count_drop: "Far fewer rows than usual",
  null_spike: "A field started coming back empty",
  field_vanished: "A field stopped extracting entirely",
  value_collapse: "Every row now reports the same value",
  distribution_shift: "The values moved well outside their usual range",
};

const SEVERITY_NOTE: Record<string, string> = {
  critical: "Output is almost certainly wrong",
  warn: "Worth a look before the next cycle",
  info: "Recorded, no action needed",
};

/**
 * Drift is a second, independent detector, so it reads as a signal rather than an
 * error page: severity lives in a rail and a chip, the evidence sits in its own
 * framed readout, and the tint is confined to the header instead of washing the
 * whole row red.
 */
export function DriftSignals({ alerts, scraperCount }: { alerts: DriftAlertView[]; scraperCount: number }) {
  if (alerts.length === 0) {
    return (
      <div className="sentry-clear">
        <span className="sentry-clear-mark" aria-hidden>◇</span>
        <div>
          <div className="sentry-clear-title">Nothing drifting</div>
          <p>
            Row counts, empty-value rates and value spreads all sit where they have been
            sitting across this flock&apos;s recent runs.
          </p>
        </div>
      </div>
    );
  }

  const fleetWide = alerts.filter((a) => a.fleetWide).length;

  return (
    <div className="sentry">
      {fleetWide > 0 && (
        <div className="sentry-banner">
          <span className="sentry-banner-n">{fleetWide}</span>
          <span>
            {fleetWide === 1 ? "signal" : "signals"} every scraper agreed on — the vote had
            nothing to compare and raised nothing.
          </span>
        </div>
      )}

      {alerts.map((a) => (
        <article className={`sentry-row sev-${a.severity}`} key={a.id}>
          <header className="sentry-head">
            <span className="sentry-sev">
              <span className="sentry-sev-dot" aria-hidden />
              {a.severity}
            </span>
            <h4 className="sentry-kind">{DRIFT_MEANING[a.kind] ?? a.kind}</h4>
            <span className="sentry-field">{a.field ?? "dataset"}</span>
          </header>

          <div className="sentry-body">
            <p className="sentry-detail">{a.detail}</p>

            {(a.baseline !== null || a.current !== null) && (
              <dl className="sentry-figures">
                <div>
                  <dt>was</dt>
                  <dd>{a.baseline ?? "—"}</dd>
                </div>
                <div className="sentry-figures-arrow" aria-hidden>→</div>
                <div>
                  <dt>now</dt>
                  <dd className="is-now">{a.current ?? "—"}</dd>
                </div>
              </dl>
            )}

            {a.fleetWide ? (
              <p className="sentry-fleet">
                <strong>All {scraperCount} scrapers agreed on this.</strong> A single-scraper
                pipeline and a flock would both have shipped it — consensus works by
                disagreement, and there was none.
              </p>
            ) : (
              <p className="sentry-note">{SEVERITY_NOTE[a.severity]}</p>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
