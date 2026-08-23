"use client";

import { useCallback, useEffect, useState } from "react";
import type { JobRecord, TargetSummary } from "@silk/core";

import { logClass, timeAgo } from "@/lib/format";
import { Reveal } from "@/components/reveal";
import { FlockCard } from "@/components/flock-card";
import { CommissionForm } from "@/components/commission-form";

export default function Console() {
  const [targets, setTargets] = useState<TargetSummary[]>([]);
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [loaded, setLoaded] = useState(false);

  const busy = jobs.some((j) => j.status === "running");

  const refresh = useCallback(async () => {
    const res = await fetch("/api/targets", { cache: "no-store" });
    const data = await res.json();
    setTargets(data.targets);
    setJobs(data.jobs);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void refresh();
    // Live cadence only while a flock is building or a cycle is running; otherwise a
    // slow heartbeat, so an idle dashboard left open does not hammer the database.
    const t = setInterval(refresh, busy ? 4000 : 20000);
    return () => clearInterval(t);
  }, [refresh, busy]);

  const runningFlocks = jobs.filter((j) => j.kind === "flock" && j.status === "running");

  // What is already running is the reason to open this page; commissioning something
  // new is the occasional act. The order follows that.
  const signals = targets.reduce((n, t) => n + t.openAlerts, 0);

  return (
    <>
      <header className="console-head">
        <div>
          <span className="eyebrow no-rule">Under watch</span>
          <h1>Your flocks</h1>
        </div>
        {loaded && targets.length > 0 && (
          <dl className="console-tally">
            <div>
              <dt>targets</dt>
              <dd>{targets.length}</dd>
            </div>
            <div>
              <dt>scrapers</dt>
              <dd>{targets.reduce((n, t) => n + t.variantCount, 0)}</dd>
            </div>
            <div className={signals > 0 ? "is-signal" : undefined}>
              <dt>signals</dt>
              <dd>{signals}</dd>
            </div>
          </dl>
        )}
      </header>

      {!loaded ? (
        <div className="empty"><span className="spinner" />Loading…</div>
      ) : targets.length === 0 ? (
        <div className="panel empty">
          No flocks yet. Commission one below and Quorum will build three scrapers for it.
        </div>
      ) : (
        <div className="grid grid-3 gap-lg">
          {targets.map((t, i) => (
            <Reveal key={t.id} delay={i * 50}>
              <FlockCard t={t} />
            </Reveal>
          ))}
        </div>
      )}

      {runningFlocks.length > 0 && (
        <div className="section">
          <div className="section-head">
            <div>
              <span className="eyebrow no-rule">In construction</span>
              <div className="h2" style={{ marginTop: 6 }}>Bright Data is writing the scrapers</div>
            </div>
            <div className="sub faint">5 to 25 minutes per variant — this page keeps itself current.</div>
          </div>
          {runningFlocks.map((j) => (
            <div className="panel" key={j.id} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, gap: 12 }}>
                <div className="h2"><span className="spinner" />{j.target_name}</div>
                <div className="sub faint mono" style={{ fontSize: 11 }}>started {timeAgo(j.created_at)}</div>
              </div>
              <div className="log">
                {j.log.map((line, i) => (
                  <div key={i} className={logClass(line)}>{line}</div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <CommissionForm onCreated={refresh} />
    </>
  );
}
