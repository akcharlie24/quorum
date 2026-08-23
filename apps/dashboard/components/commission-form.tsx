"use client";

import { useState } from "react";
import type { FieldType } from "@silk/core";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface FieldDraft {
  name: string;
  type: FieldType;
}

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: "string", label: "string" },
  { value: "number", label: "number" },
  { value: "integer", label: "integer" },
];

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

/** The three beats of what commissioning actually does, so the header carries the
    explanation and the form itself can just be a form. */
const BEATS = [
  { n: "01", t: "Three scrapers", d: "One URL, three incompatible extraction strategies." },
  { n: "02", t: "One vote", d: "They run together and agree on every value before it ships." },
  { n: "03", t: "Zero humans", d: "That agreement is what grades Bright Data's repair." },
];

export function CommissionForm({ onCreated }: { onCreated: () => void | Promise<void> }) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [itemLabel, setItemLabel] = useState("product");
  const [urls, setUrls] = useState("");
  const [description, setDescription] = useState("");
  const [fields, setFields] = useState<FieldDraft[]>(PRESETS.Products.fields);
  const [keyField, setKeyField] = useState("name");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        body: JSON.stringify({ name, url, itemLabel, description, keyField, fields, urls }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed to start");
      setUrl("");
      setUrls("");
      setName("");
      await onCreated();
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="section">
      {/* ── header: explanation on the left, the mechanic on the right ── */}
      <div className="commission-head">
        <div className="commission-intro">
          <span className="eyebrow no-rule">New target</span>
          <h2>Commission a flock</h2>
          <p>
            Paste a URL and name the fields you want. Quorum does the rest — and nothing it
            ships was ever taken on one scraper&apos;s word.
          </p>
        </div>
        <ol className="beats">
          {BEATS.map((b) => (
            <li key={b.n}>
              <span className="beats-n">{b.n}</span>
              <span className="beats-t">{b.t}</span>
              <span className="beats-d">{b.d}</span>
            </li>
          ))}
        </ol>
      </div>

      <form onSubmit={submit} className="panel form" style={{ borderColor: "var(--line-ink)" }}>
        {error && <div className="banner banner-err">{error}</div>}

        {/* ── where to look ── */}
        <div className="fgroup" role="group" aria-labelledby="fg-where">
          <div className="fgroup-legend" id="fg-where">Where to look</div>

          <div className="fgrid fgrid-url">
            <div className="field">
              <label className="label" htmlFor="cf-url">Target URL</label>
              <input
                id="cf-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/listings"
                required
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="cf-name">Flock name</label>
              <input
                id="cf-name"
                value={name}
                onChange={(e) => setName(e.target.value.replace(/\s+/g, "-").toLowerCase())}
                placeholder="my-listings"
                required
              />
            </div>
          </div>

          <div className="fgrid fgrid-pages">
            <div className="field">
              <label className="label" htmlFor="cf-urls">Exact pages <span className="label-opt">optional</span></label>
              <textarea
                id="cf-urls"
                value={urls}
                onChange={(e) => setUrls(e.target.value)}
                rows={3}
                placeholder={"https://example.com/item/1\nhttps://example.com/item/2"}
              />
            </div>
            <p className="fnote">
              One URL per line. Leave it empty to scrape the listing above — but naming the
              pages yourself stops Bright Data inventing a crawl of its own.
              <span className="fnote-evidence">
                On one listing it fetched ~150 pages and returned nothing.
              </span>
            </p>
          </div>
        </div>

        {/* ── what a row is ── */}
        <div className="fgroup" role="group" aria-labelledby="fg-row">
          <div className="fgroup-legend" id="fg-row">What a row is</div>
          <div className="fgrid fgrid-url">
            <div className="field">
              <label className="label" htmlFor="cf-item">Each row is a…</label>
              <input
                id="cf-item"
                value={itemLabel}
                onChange={(e) => setItemLabel(e.target.value)}
                placeholder="product"
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="cf-desc">Extra instruction <span className="label-opt">optional</span></label>
              <input
                id="cf-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Only items in the main listing grid."
              />
            </div>
          </div>
        </div>

        {/* ── the schema ── */}
        <div className="fgroup fgroup-last" role="group" aria-labelledby="fg-fields">
          <div className="fgroup-bar">
            <div className="fgroup-legend" id="fg-fields">Fields to extract</div>
            <div className="presets">
              <span className="presets-label">Start from</span>
              {Object.keys(PRESETS).map((p) => (
                <button type="button" key={p} className="btn btn-ghost btn-sm" onClick={() => applyPreset(p)}>
                  <span>{p}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="schema">
            <div className="schema-head" aria-hidden>
              <span>Field name</span>
              <span>Type</span>
              <span>Key</span>
              <span />
            </div>

            {fields.map((f, i) => (
              <div className="schema-row" key={i}>
                <input
                  value={f.name}
                  onChange={(e) => {
                    const next = [...fields];
                    next[i] = { ...f, name: e.target.value };
                    setFields(next);
                  }}
                  placeholder="field name"
                  aria-label={`Field ${i + 1} name`}
                />
                <Select
                  value={f.type}
                  onValueChange={(v) => {
                    const next = [...fields];
                    next[i] = { ...f, type: v as FieldType };
                    setFields(next);
                  }}
                >
                  <SelectTrigger aria-label={`Type for ${f.name || `field ${i + 1}`}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FIELD_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <label className="keycell" title="The field that identifies a row across all three scrapers">
                  <input
                    type="radio"
                    name="keyField"
                    checked={keyField === f.name}
                    onChange={() => setKeyField(f.name)}
                  />
                  <span>key</span>
                </label>
                <button
                  type="button"
                  className="iconbtn"
                  onClick={() => setFields(fields.filter((_, j) => j !== i))}
                  disabled={fields.length === 1}
                  aria-label={`Remove ${f.name || `field ${i + 1}`}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          <p className="fnote fnote-inline">
            The <strong>key</strong> field is how a row is matched across all three scrapers, so
            pick the one that is unique and stable.
          </p>
        </div>

        <div className="form-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setFields([...fields, { name: "", type: "string" }])}
          >
            <span>+ Add field</span>
          </button>
          <button className="btn" disabled={submitting}>
            {submitting ? (
              <span><span className="spinner" />Commissioning…</span>
            ) : (
              <>
                <span>Commission the flock</span>
                <span className="arrow">→</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
