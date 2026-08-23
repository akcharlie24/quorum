"use client";

import { useCallback, useEffect, useState, use } from "react";
import type { JobRecord, TargetDetail } from "@silk/core";
import { STRATEGY_BLURB, STRATEGY_LABEL } from "@silk/core/browser";
import { logClass, timeAgo } from "@/lib/format";

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

  if (missing) return <div className="panel empty">No Flock named “{target}”.</div>;
  if (!detail) return <div className="empty"><span className="spinner" />Loading…</div>;

  const activeJob = jobs.find((j) => j.status === "running");
  const lastJob = jobs[0];
  const fields = Object.keys(detail.schema.fields);
  const disputedCells = new Set(detail.votes.map((v) => `${v.rowKey}::${v.field}`));
  const keyField = detail.schema.keyField;

  // rowKey as stored by the consensus engine (lowercased, whitespace-collapsed)
  const rowKeyOf = (row: Record<string, unknown>) =>
    String(row[keyField] ?? "").toLowerCase().replace(/\s+/g, " ").trim();

  const voteFor = (rowKey: string, field: string) =>
    detail.votes.find((v) => v.rowKey === rowKey && v.field === field);

  const strategyOf = (variantId: number) =>
    detail.variants.find((v) => v.id === variantId)?.strategy ?? `#${variantId}`;

  return (
    <>
      <div className="section-head" style={{ alignItems: "center", marginBottom: 18 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <h2 style={{ fontSize: 20, fontWeight: 660, letterSpacing: "-0.3px" }}>{detail.name}</h2>
            <span className={`pill pill-${detail.health}`}>{detail.health}</span>
          </div>
          <a className="sub mono faint" href={detail.url} target="_blank" rel="noreferrer">
            {detail.url} ↗
          </a>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost btn-sm" disabled={!!activeJob || starting} onClick={() => runCycle(false)}>
            Scrape only
          </button>
          <button className="btn btn-sm" disabled={!!activeJob || starting} onClick={() => runCycle(true)}>
            {activeJob ? <><span className="spinner" />Running…</> : "▶ Run cycle"}
          </button>
        </div>
      </div>

      {detail.variants.length === 0 && (
        <div className="banner banner-info">
          <span className="spinner" />
          Bright Data is still building this Flock&apos;s scrapers. This page updates itself.
        </div>
      )}

      {/* ---- the flock ---- */}
      <div className="section" style={{ marginTop: 4 }}>
        <div className="section-head">
          <div className="h2">The Flock</div>
          <div className="sub faint">Three extraction philosophies — so one site change can&apos;t kill them all.</div>
        </div>
        <div className="grid grid-3">
          {detail.variants.map((v) => (
            <div className={`vcard is-${v.lastRunStatus ?? "pending"}`} key={v.id}>
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
                <div className="sub" style={{ color: "var(--amber)", marginTop: 8 }}>
                  outvoted on {v.dissentCount} cell{v.dissentCount === 1 ? "" : "s"}
                </div>
              )}
              {v.error && (
                <div className="sub" style={{ color: "var(--red-soft)", marginTop: 8 }}>{v.error}</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ---- live log ---- */}
      {(activeJob || (lastJob && lastJob.status === "error")) && (
        <div className="section">
          <div className="section-head">
            <div className="h2">{activeJob ? "Cycle in progress" : "Last cycle failed"}</div>
            <div className="sub faint">{timeAgo((activeJob ?? lastJob).created_at)}</div>
          </div>
          <div className="log">
            {(activeJob ?? lastJob).log.map((line, i) => (
              <div key={i} className={logClass(line)}>{line}</div>
            ))}
            {activeJob && <div className="log-line"><span className="spinner" />working…</div>}
          </div>
        </div>
      )}

      {/* ---- consensus data ---- */}
      <div className="section">
        <div className="section-head">
          <div>
            <div className="h2">Consensus output</div>
            <div className="sub faint">
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
          <div className="panel panel-flush tablewrap">
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

      {/* ---- heal timeline ---- */}
      <div className="section">
        <div className="section-head">
          <div>
            <div className="h2">Healing ledger</div>
            <div className="sub faint">
              Every repair Bright Data proposed, and how the Flock&apos;s consensus judged it.
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
                    <span className="faint" style={{ fontWeight: 400 }}>
                      {" "}· {STRATEGY_LABEL[h.strategy as keyof typeof STRATEGY_LABEL] ?? h.strategy} · {timeAgo(h.started_at)}
                    </span>
                  </div>
                  {h.verdict_reason && <div className="heal-reason">{h.verdict_reason}</div>}
                  <div className="heal-prompt">{h.prompt}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---- history ---- */}
      {detail.history.length > 0 && (
        <div className="section">
          <div className="section-head">
            <div className="h2">Run history</div>
            <div className="sub faint">Scraper health across the last {detail.history.length} cycles.</div>
          </div>
          <div className="panel">
            <div className="hist">
              {detail.history.map((h) => (
                <div className="hist-col" key={h.runId} title={`run #${h.runId} · ${h.startedAt}`}>
                  {h.healthy > 0 && <div className="hist-seg hist-healthy" style={{ height: h.healthy * 13 }} />}
                  {h.dissenting > 0 && <div className="hist-seg hist-dissenting" style={{ height: h.dissenting * 13 }} />}
                  {h.broken > 0 && <div className="hist-seg hist-broken" style={{ height: h.broken * 13 }} />}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
