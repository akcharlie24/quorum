import type { Metadata } from "next";

import { Reveal } from "@/components/reveal";
import { HealLoop } from "@/components/diagrams/heal-loop";
import { SilentDrift } from "@/components/diagrams/silent-drift";
import { StrategyCss, StrategyDom, StrategyText } from "@/components/diagrams/strategies";

export const metadata: Metadata = { title: "How the flock decides" };

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
    d: "A losing scraper triggers Bright Data's self-healing, with a prompt written from the disagreement itself. Bright Data returns a proposed fix plus a preview, and waits for approval. Quorum runs that preview through the same vote against the healthy scrapers: 90% match or better and the fix is approved automatically; below that it is rejected and retried with a sharper prompt. Two failures and it escalates to a human. Automatic, but never blind.",
  },
];

const PHILOSOPHIES = [
  { d: <StrategyCss />, t: "CSS selectors", p: "Targets class names and IDs. Fast, precise, first to die in a redesign." },
  { d: <StrategyText />, t: "Text anchors", p: "Banned from classes. Finds values by the visible label beside them. Sails through renames." },
  { d: <StrategyDom />, t: "DOM structure", p: "Navigates by position inside repeated containers. Survives renames, breaks on reordering." },
];

export default function HowItWorks() {
  return (
    <>
      <div className="hero-strip">
        <span className="eyebrow no-rule">Reference</span>
        <h2 style={{ marginTop: 10 }}>How the flock decides</h2>
        <p>
          Self-healing repairs a scraper. It cannot tell you <em>when</em> a scraper broke silently, or whether the
          repair was actually correct. Quorum answers both with one mechanism: redundancy plus a vote.
        </p>
      </div>

      <div className="section">
        <div className="section-head">
          <div>
            <span className="eyebrow no-rule">Decorrelated by design</span>
            <div className="h2" style={{ marginTop: 6 }}>One number, three unrelated ways to find it</div>
          </div>
        </div>
        <div className="grid grid-3 gap-lg">
          {PHILOSOPHIES.map((s, i) => (
            <Reveal key={s.t} delay={i * 70}>
              <div className="panel">
                <div style={{ border: "1px solid var(--line)", marginBottom: 16 }}>{s.d}</div>
                <div className="h2" style={{ marginBottom: 5 }}>{s.t}</div>
                <div className="sub">{s.p}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <div>
            <span className="eyebrow no-rule">A cycle, step by step</span>
            <div className="h2" style={{ marginTop: 6 }}>From pasted URL to defensible value</div>
          </div>
        </div>
        {STEPS.map((s, i) => (
          <Reveal key={s.n} delay={i * 45}>
            <div className="panel" style={{ marginBottom: 12, display: "flex", gap: 20 }}>
              <div className="mono" style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-4)", minWidth: 28, paddingTop: 2 }}>
                {s.n}
              </div>
              <div>
                <div className="h2" style={{ marginBottom: 6 }}>{s.t}</div>
                <div className="sub" style={{ maxWidth: "78ch", lineHeight: 1.7 }}>{s.d}</div>
              </div>
            </div>
          </Reveal>
        ))}
      </div>

      <div className="section">
        <div className="section-head">
          <div>
            <span className="eyebrow no-rule">The failure that hides</span>
            <div className="h2" style={{ marginTop: 6 }}>Silent drift, drawn</div>
          </div>
          <div className="sub faint">Every monitor stays green while the numbers go to zero.</div>
        </div>
        <Reveal>
          <div className="panel plus-corners" style={{ borderColor: "var(--line-ink)", padding: 24 }}>
            <SilentDrift />
          </div>
        </Reveal>
      </div>

      <div className="section">
        <div className="section-head">
          <div>
            <span className="eyebrow no-rule">The closed loop</span>
            <div className="h2" style={{ marginTop: 6 }}>Repair, scored before it merges</div>
          </div>
          <div className="sub faint">We never pass <code className="mono">--auto-approve</code>.</div>
        </div>
        <Reveal>
          <div className="panel plus-corners" style={{ borderColor: "var(--line-ink)", padding: "16px 24px 24px" }}>
            <HealLoop />
          </div>
        </Reveal>
      </div>

      <div className="panel section" style={{ borderColor: "var(--line-ink)", borderLeftWidth: 3, borderLeftColor: "var(--brand)" }}>
        <div className="h2" style={{ marginBottom: 8 }}>Why this matters</div>
        <div className="sub" style={{ maxWidth: "78ch", lineHeight: 1.7 }}>
          A single scraper has no way to know it is wrong. It returns a number, and the number looks like a number.
          Three scrapers that disagree have discovered something no individual scraper can: that reality and
          extraction have come apart. Everything Quorum does — detection, verified healing, reliability history —
          falls out of that one fact.
        </div>
      </div>
    </>
  );
}
