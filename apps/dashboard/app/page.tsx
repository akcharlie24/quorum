"use client";

import { useCallback, useEffect, useState } from "react";
import type { FieldType, JobRecord, TargetSummary } from "@silk/core";
import { logClass, timeAgo } from "@/lib/format";

interface FieldDraft {
  name: string;
  type: FieldType;
}

const PRESETS: Record<string, { itemLabel: string; fields: FieldDraft[] }> = {
  Products: {
    itemLabel: "product",
    fields: [
      { name: "name", type: "string" },
      { name: "price", type: "number" },
      { name: "rating", type: "number" },
      { name: "stock", type: "integer" },
    ],
  },
  "Job posts": {
    itemLabel: "job posting",
    fields: [
      { name: "title", type: "string" },
      { name: "company", type: "string" },
      { name: "location", type: "string" },
    ],
  },
  Articles: {
    itemLabel: "article",
    fields: [
      { name: "title", type: "string" },
      { name: "author", type: "string" },
      { name: "date", type: "string" },
    ],
  },
};

export default function Home() {
  const [targets, setTargets] = useState<TargetSummary[]>([]);
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [loaded, setLoaded] = useState(false);

  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [itemLabel, setItemLabel] = useState("product");
  const [description, setDescription] = useState("");
  const [fields, setFields] = useState<FieldDraft[]>(PRESETS.Products.fields);
  const [keyField, setKeyField] = useState("name");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/targets", { cache: "no-store" });
    const data = await res.json();
    setTargets(data.targets);
    setJobs(data.jobs);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [refresh]);

  function applyPreset(key: string) {
    const p = PRESETS[key];
    setFields(p.fields);
    setItemLabel(p.itemLabel);
    setKeyField(p.fields[0].name);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, url, itemLabel, description, keyField, fields }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed to start");
      setUrl("");
      setName("");
      await refresh();
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setSubmitting(false);
    }
  }

  const runningFlocks = jobs.filter((j) => j.kind === "flock" && j.status === "running");

  return (
    <>
      <div className="hero">
        <h2>Spin up a Flock</h2>
        <p>
          SILK builds <strong>three</strong> scrapers for every URL — each told to extract the same data a different
          way. They run together and vote on every value, so when a site changes, the survivors outvote the casualty
          and your data stays clean. Their agreement is also what grades Bright Data&apos;s repair, which is why
          healing needs no human.
        </p>
      </div>

      <form onSubmit={submit} className="panel section" style={{ marginTop: 14 }}>
        {error && <div className="banner banner-err">{error}</div>}

        <div className="grid grid-2" style={{ marginBottom: 14 }}>
          <div className="field">
            <label className="label">Target URL</label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/listings"
              required
            />
          </div>
          <div className="field">
            <label className="label">Flock name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value.replace(/\s+/g, "-").toLowerCase())}
              placeholder="my-listings"
              required
            />
          </div>
        </div>

        <div className="grid grid-2" style={{ marginBottom: 18 }}>
          <div className="field">
            <label className="label">Each row is a…</label>
            <input value={itemLabel} onChange={(e) => setItemLabel(e.target.value)} placeholder="product" />
          </div>
          <div className="field">
            <label className="label">Extra instruction (optional)</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Only items in the main listing grid."
            />
          </div>
        </div>

        <div className="section-head" style={{ marginBottom: 10 }}>
          <div>
            <div className="label" style={{ marginBottom: 3 }}>Fields to extract</div>
            <div className="sub faint">The key field identifies a row across all three scrapers.</div>
          </div>
          <div style={{ display: "flex", gap: 7 }}>
            {Object.keys(PRESETS).map((p) => (
              <button type="button" key={p} className="btn btn-ghost btn-sm" onClick={() => applyPreset(p)}>
                {p}
              </button>
            ))}
          </div>
        </div>

        {fields.map((f, i) => (
          <div className="field-row" key={i}>
            <input
              value={f.name}
              onChange={(e) => {
                const next = [...fields];
                next[i] = { ...f, name: e.target.value };
                setFields(next);
              }}
              placeholder="field name"
            />
            <select
              value={f.type}
              onChange={(e) => {
                const next = [...fields];
                next[i] = { ...f, type: e.target.value as FieldType };
                setFields(next);
              }}
            >
              <option value="string">string</option>
              <option value="number">number</option>
              <option value="integer">integer</option>
            </select>
            <label className="keycell">
              <input
                type="radio"
                name="keyField"
                style={{ width: "auto" }}
                checked={keyField === f.name}
                onChange={() => setKeyField(f.name)}
              />
              key
            </label>
            <button
              type="button"
              className="iconbtn"
              onClick={() => setFields(fields.filter((_, j) => j !== i))}
              disabled={fields.length === 1}
            >
              ×
            </button>
          </div>
        ))}

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setFields([...fields, { name: "", type: "string" }])}
          >
            + Add field
          </button>
          <button className="btn" disabled={submitting}>
            {submitting ? <><span className="spinner" />Launching…</> : "🕸 Spin up Flock"}
          </button>
        </div>
      </form>

      {runningFlocks.length > 0 && (
        <div className="section">
          <div className="section-head">
            <div className="h2">Building</div>
            <div className="sub faint">Bright Data writes each scraper with AI — 5 to 25 minutes per variant.</div>
          </div>
          {runningFlocks.map((j) => (
            <div className="panel" key={j.id} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 11 }}>
                <div className="h2"><span className="spinner" />{j.target_name}</div>
                <div className="sub faint">started {timeAgo(j.created_at)}</div>
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

      <div className="section">
        <div className="section-head">
          <div className="h2">Your Flocks</div>
          {targets.length > 0 && <div className="sub faint">{targets.length} target{targets.length === 1 ? "" : "s"} under watch</div>}
        </div>

        {!loaded ? (
          <div className="empty"><span className="spinner" />Loading…</div>
        ) : targets.length === 0 ? (
          <div className="panel empty">
            No Flocks yet. Paste a URL above and SILK will build three scrapers for it.
          </div>
        ) : (
          <div className="grid grid-3">
            {targets.map((t) => (
              <a className="tcard" key={t.id} href={`/flock/${encodeURIComponent(t.name)}`}>
                <div className="tcard-head">
                  <h3>{t.name}</h3>
                  <span className={`pill pill-${t.health}`}>{t.health}</span>
                </div>
                <div className="url">{t.url}</div>
                <div className="tcard-stats">
                  <div className="stat">
                    <div className="k">{t.variantCount}</div>
                    <div className="v">scrapers</div>
                  </div>
                  <div className="stat">
                    <div className="k">{t.consensusRows}</div>
                    <div className="v">rows</div>
                  </div>
                  <div className="stat">
                    <div className="k">{t.runCount}</div>
                    <div className="v">runs</div>
                  </div>
                  <div className="stat">
                    <div className="k">{t.healApproved}</div>
                    <div className="v">healed</div>
                  </div>
                </div>
                <div className="sub faint" style={{ marginTop: 11 }}>last run {timeAgo(t.lastRunAt)}</div>
              </a>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
