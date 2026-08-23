const STEPS = [
  {
    n: "01",
    t: "Three scrapers, three philosophies",
    d: "For one URL, Bright Data generates three scrapers from the same output schema but deliberately different instructions: one uses CSS classes and IDs, one is forbidden from using them and must find values by visible text and patterns, one navigates by DOM structure and position. The point is decorrelated failure — a class rename kills the first and leaves the other two standing.",
  },
  {
    n: "02",
    t: "Normalize before comparing",
    d: "Scrapers return messy strings. Every value is coerced to its declared type — “$129.99” becomes 129.99, “In stock: 12” becomes 12 — and field names are fuzzy-matched, so product_price and Price land in the same slot. Without this, variants would disagree purely on formatting.",
  },
  {
    n: "03",
    t: "Line up the rows",
    d: "Rows are matched across scrapers by the key field you chose. A row enters the canonical set only if a majority of working scrapers found it — that stops a broken scraper from silently deleting rows from your output, or a confused one from inventing them.",
  },
  {
    n: "04",
    t: "Vote on every cell",
    d: "For each row-and-field pair, the three values are clustered (numbers compare with a small tolerance) and the largest cluster with at least two members wins. Voting per cell rather than per scraper means a scraper that gets prices wrong but names right only loses the price cells — its good data survives and we know exactly what broke.",
  },
  {
    n: "05",
    t: "Grade each scraper",
    d: "Healthy means it agreed everywhere. Dissenting means it was outvoted on some cells — the signature of silent corruption, the failure mode that returns valid-looking garbage and never raises an error. Broken means it errored, returned nothing, or lost more than half its cells.",
  },
  {
    n: "06",
    t: "Heal — and judge the repair with the same vote",
    d: "A losing scraper triggers Bright Data's self-healing, with a prompt written from the disagreement itself. Bright Data returns a proposed fix plus a preview, and waits for approval. SILK runs that preview through the same vote against the healthy scrapers: 90% match or better and the fix is approved automatically; below that it is rejected and retried with a sharper prompt. Two failures and it escalates to a human. Automatic, but never blind.",
  },
];

export default function HowItWorks() {
  return (
    <>
      <div className="hero">
        <h2>How the Flock decides</h2>
        <p>
          Self-healing repairs a scraper. It cannot tell you <em>when</em> a scraper broke silently, or whether the
          repair was actually correct. SILK answers both with one mechanism: redundancy plus a vote.
        </p>
      </div>

      <div className="section" style={{ marginTop: 16 }}>
        {STEPS.map((s) => (
          <div className="panel" key={s.n} style={{ marginBottom: 12, display: "flex", gap: 18 }}>
            <div
              className="mono"
              style={{ fontSize: 22, fontWeight: 700, color: "var(--line)", lineHeight: 1.1, minWidth: 40 }}
            >
              {s.n}
            </div>
            <div>
              <div className="h2" style={{ marginBottom: 5 }}>{s.t}</div>
              <div className="sub" style={{ maxWidth: "78ch", lineHeight: 1.65 }}>{s.d}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="panel section" style={{ borderColor: "var(--blue)" }}>
        <div className="h2" style={{ marginBottom: 6 }}>Why this matters</div>
        <div className="sub" style={{ maxWidth: "78ch", lineHeight: 1.65 }}>
          A single scraper has no way to know it is wrong. It returns a number, and the number looks like a number.
          Three scrapers that disagree have discovered something no individual scraper can: that reality and
          extraction have come apart. Everything SILK does — detection, verified healing, reliability history —
          falls out of that one fact.
        </div>
      </div>
    </>
  );
}
