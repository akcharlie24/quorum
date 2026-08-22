"use client";

import { useCallback, useEffect, useState, use } from "react";
import type { JobRecord, TargetDetail } from "@silk/core";
import { STRATEGY_BLURB, STRATEGY_LABEL } from "@silk/core/browser";

import { logClass, timeAgo } from "@/lib/format";
import { Reveal } from "@/components/reveal";
import { RunHistory } from "@/components/run-history";

const STATUS_PILL: Record<string, string> = {
  healthy: "pill-healthy",
  dissenting: "pill-degraded",
  broken: "pill-down",
};

export default function FlockPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = use(params);
  const target = decodeURIComponent(name);

  const [detail, setDetail] = useState<TargetDetail | null>(null);
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [missing, setMissing] = useState(false);
  const [starting, setStarting] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/targets/${encodeURIComponent(target)}`, { cache: "no-store" });
    if (res.status === 404) return setMissing(true);
    const data = await res.json();
    setDetail(data.detail);
    setJobs(data.jobs);
  }, [target]);

  useEffect(() => {
    void refresh();
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [refresh]);

  async function runCycle(heal: boolean) {
    setStarting(true);
    await fetch(`/api/targets/${encodeURIComponent(target)}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ heal }),
    });
    await refresh();
    setStarting(false);
  }

  if (missing) return <div className="panel empty">No flock named “{target}”.</div>;
  if (!detail) return <div className="empty"><span className="spinner" />Loading…</div>;

  const activeJob = jobs.find((j) => j.status === "running");
  const lastJob = jobs[0];
  const fields = Object.keys(detail.schema.fields);
  const disputedCells = new Set(detail.votes.map((v) => `${v.rowKey}::${v.field}`));
  const keyField = detail.schema.keyField;

  const rowKeyOf = (row: Record<string, unknown>) =>
    String(row[keyField] ?? "").toLowerCase().replace(/\s+/g, " ").trim();

  const voteFor = (rowKey: string, field: string) =>
    detail.votes.find((v) => v.rowKey === rowKey && v.field === field);

  const strategyOf = (variantId: number) =>
    detail.variants.find((v) => v.id === variantId)?.strategy ?? `#${variantId}`;

  // A retired variant disappears until its replacement is built; show it as pending
  // rather than letting the card silently vanish for 25 minutes.
  const present = new Set(detail.variants.map((v) => v.strategy));
  const buildingStrategies = (
    activeJob?.kind === "flock"
      ? (Object.keys(STRATEGY_LABEL) as (keyof typeof STRATEGY_LABEL)[])
      : []
  ).filter((s) => !present.has(s));

  return (
    <>
      <div className="crumb">
        <a href="/dashboard">FLOCKS</a>
        <span>/</span>
        <span style={{ color: "var(--ink-3)" }}>{detail.name.toUpperCase()}</span>
      </div>

      <div className="section-head" style={{ alignItems: "center", marginBottom: 22 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h2 style={{ fontSize: 26 }}>{detail.name}</h2>
            <span className={`pill pill-${detail.health}`}>{detail.health}</span>
            {activeJob && (
              <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span className="live-dot" />
                <span className="mono" style={{ fontSize: 10, letterSpacing: ".1em", color: "var(--ink-3)" }}>
                  CYCLE RUNNING
                </span>
              </span>
            )}
          </div>
          <a className="sub mono faint" href={detail.url} target="_blank" rel="noreferrer">
            {detail.url} ↗
          </a>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost btn-sm" disabled={!!activeJob || starting} onClick={() => runCycle(false)}>
            <span>Scrape only</span>
          </button>
          <button className="btn btn-sm" disabled={!!activeJob || starting} onClick={() => runCycle(true)}>
            {activeJob ? (
              <span><span className="spinner" />Running…</span>
            ) : (
              <>
                <span>Run cycle</span>
                <span className="arrow">→</span>
              </>
            )}
          </button>
        </div>
      </div>

      {detail.variants.length === 0 && (
        <div className="banner banner-info">
          <span className="spinner" />
          Bright Data is still writing this flock&apos;s scrapers. This page updates itself.
        </div>
      )}

      <div className="section" style={{ marginTop: 8 }}>
        <div className="section-head">
          <div>
            <span className="eyebrow no-rule">The flock</span>
            <div className="h2" style={{ marginTop: 6 }}>Three extraction philosophies</div>
          </div>
          <div className="sub faint">So one site change can&apos;t kill them all.</div>
        </div>
        <div className="grid grid-3 gap-lg">
          {detail.variants.map((v, i) => (
            <Reveal key={v.id} delay={i * 60}>
              <div className={`vcard is-${v.lastRunStatus ?? "pending"}`}>
                <div className="vcard-top">
                  <h4>{STRATEGY_LABEL[v.strategy] ?? v.strategy}</h4>
                  {v.lastRunStatus ? (
                    <span className={`pill ${STATUS_PILL[v.lastRunStatus]}`}>{v.lastRunStatus}</span>
                  ) : (
                    <span className="pill pill-pending">no runs</span>
                  )}
                </div>
                <div className="blurb">{STRATEGY_BLURB[v.strategy]}</div>
                <div className="cid">{v.collector_id}</div>
                {v.dissentCount > 0 && (
                  <div className="sub" style={{ color: "var(--dissent)", marginTop: 10 }}>
                    outvoted on {v.dissentCount} cell{v.dissentCount === 1 ? "" : "s"}
                  </div>
                )}
                {v.error && (
                  <div className="sub" style={{ color: "var(--break)", marginTop: 10 }}>{v.error}</div>
                )}
              </div>
            </Reveal>
          ))}
          {buildingStrategies.map((strategy) => (
            <div className="vcard is-pending" key={`building-${strategy}`} style={{ opacity: 0.75 }}>
              <div className="vcard-top">
                <h4>{STRATEGY_LABEL[strategy]}</h4>
                <span className="pill pill-pending">
                  <span className="spinner" style={{ marginRight: 0 }} />
                  building
                </span>
              </div>
              <div className="blurb">{STRATEGY_BLURB[strategy]}</div>
              <div className="cid faint">Bright Data is generating this scraper (10-25 min)…</div>
            </div>
          ))}
        </div>
      </div>

      {/* ---- live log ---- */}
      {(activeJob || (lastJob && lastJob.status === "error")) && (
        <div className="section">
          <div className="section-head">
            <div>
              <span className="eyebrow no-rule">{activeJob ? "Live" : "Failure"}</span>
              <div className="h2" style={{ marginTop: 6 }}>{activeJob ? "Cycle in progress" : "Last cycle failed"}</div>
            </div>
            <div className="sub faint mono" style={{ fontSize: 11 }}>{timeAgo((activeJob ?? lastJob).created_at)}</div>
          </div>
          <div className="log">
            {(activeJob ?? lastJob).log.map((line, i) => (
              <div key={i} className={logClass(line)}>{line}</div>
            ))}
            {activeJob && <div className="log-line"><span className="spinner" />working…</div>}
          </div>
        </div>
      )}

      <div className="section">
        <div className="section-head">
          <div>
            <span className="eyebrow no-rule">Output</span>
            <div className="h2" style={{ marginTop: 6 }}>Consensus table</div>
            <div className="sub faint" style={{ marginTop: 3 }}>
              What the pipeline emits — every value agreed by at least 2 of {detail.variants.length} scrapers.
            </div>
          </div>
          {detail.votes.length > 0 && (
            <span className="pill pill-degraded pill-plain">
              {detail.votes.length} disputed cell{detail.votes.length === 1 ? "" : "s"} resolved by vote
            </span>
          )}
        </div>

        {detail.consensus.length === 0 ? (
          <div className="panel empty">No data yet — run a cycle to scrape this target.</div>
        ) : (
          <div className="panel panel-flush tablewrap" style={{ borderColor: "var(--line-ink)" }}>
            <table>
              <thead>
                <tr>
                  {fields.map((f) => (
                    <th key={f}>
                      {f}
                      {f === keyField && <span className="faint"> · key</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {detail.consensus.map((row, i) => {
                  const rk = rowKeyOf(row);
                  return (
                    <tr key={i}>
                      {fields.map((f) => {
                        const disputed = disputedCells.has(`${rk}::${f}`);
                        const vote = disputed ? voteFor(rk, f) : undefined;
                        const type = detail.schema.fields[f];
                        return (
                          <td key={f} className={`${type === "string" ? "" : "num"} ${disputed ? "cell-disputed" : ""}`}>
                            {row[f] === null || row[f] === undefined ? (
                              <span className="faint">—</span>
                            ) : (
                              String(row[f])
                            )}
                            {vote && vote.dissenting.length > 0 && (
                              <span className="disputed-note">
                                {vote.dissenting
                                  .map((d) => `${strategyOf(d.variantId)} said ${JSON.stringify(d.value)}`)
                                  .join(" · ")}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="section">
        <div className="section-head">
          <div>
            <span className="eyebrow no-rule">Repairs</span>
            <div className="h2" style={{ marginTop: 6 }}>Healing ledger</div>
            <div className="sub faint" style={{ marginTop: 3 }}>
              Every repair Bright Data proposed, and how the flock&apos;s consensus judged it.
            </div>
          </div>
        </div>
        {detail.heals.length === 0 ? (
          <div className="panel empty">No repairs needed yet. Break the site and this fills up.</div>
        ) : (
          <div className="panel">
            {detail.heals.map((h) => (
              <div className="heal" key={h.id}>
                <div className={`heal-dot heal-${h.verdict}`} />
                <div className="heal-body">
                  <div className="heal-title">
                    {h.verdict === "approved" && "Fix approved automatically"}
                    {h.verdict === "rejected" && "Fix rejected — did not match consensus"}
                    {h.verdict === "pending" && "Repair in progress…"}
                    {h.verdict === "needs_human" && "Escalated to a human"}
                    <span className="faint mono" style={{ fontWeight: 400, fontSize: 11 }}>
                      {" "}· {STRATEGY_LABEL[h.strategy as keyof typeof STRATEGY_LABEL] ?? h.strategy} · {timeAgo(h.started_at)}
                    </span>
                  </div>
                  {h.verdict_reason && <div className="heal-reason">{h.verdict_reason}</div>}
                  {h.verdict === "approved" && (
                    <div className="sub" style={{ marginTop: 4 }}>
                      {h.verification === "verified" ? (
                        <span style={{ color: "var(--green)" }}>✔ proven in production on a later run</span>
                      ) : h.verification === "regressed" ? (
                        <span style={{ color: "var(--red-soft)" }}>
                          ✘ fix did not hold — scraper still failing after approval
                        </span>
                      ) : (
                        <span className="faint">awaiting production verification…</span>
                      )}
                    </div>
                  )}
                  <div className="heal-prompt">{h.prompt}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {detail.history.length > 0 && (
        <div className="section">
          <div className="section-head">
            <div>
              <span className="eyebrow no-rule">Telemetry</span>
              <div className="h2" style={{ marginTop: 6 }}>Run history</div>
            </div>
            <div className="sub faint">Scraper health across the last {detail.history.length} cycles.</div>
          </div>
          <div className="panel">
            <RunHistory history={detail.history} total={detail.variants.length} />
          </div>
        </div>
      )}
    </>
  );
}
