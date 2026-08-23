import { SiteNav } from "@/components/site-nav";
import { Logo } from "@/components/logo";
import { Reveal } from "@/components/reveal";
import { Counter } from "@/components/counter";
import { Faq } from "@/components/faq";
import { ConsensusEngine } from "@/components/diagrams/consensus-engine";
import { SilentDrift } from "@/components/diagrams/silent-drift";
import { HealLoop } from "@/components/diagrams/heal-loop";
import { Survival } from "@/components/diagrams/survival";
import { ConsolePreview } from "@/components/diagrams/console-preview";
import { StrategyCss, StrategyDom, StrategyText } from "@/components/diagrams/strategies";

// The live flocks, and only the live flocks — this strip is a claim about what is
// running right now, so it has to match the console.
const UNDER_QUORUM = [
  "imdb.com/chart/top",
  "store.steampowered.com",
  "ikea.com/desks",
  "github.com",
];

const STEPS = [
  {
    n: "STEP 01",
    t: "Three scrapers, three philosophies",
    d: "You give Quorum a URL and the fields you want. It commissions three scrapers from the same output schema but deliberately incompatible instructions: one hunts CSS classes and IDs, one is forbidden from touching them and must find values by visible text, one navigates purely by DOM shape. The point is decorrelated failure — a class rename kills the first and leaves the other two standing.",
  },
  {
    n: "STEP 02",
    t: "Normalize, then line the rows up",
    d: "Scrapers return mess. “$129.99”, {value: 129.99, currency: \"GBP\"} and “129,99 EUR” are the same number and have to be treated that way before anyone votes. Values are coerced to their declared type, field names are fuzzy-matched, and rows are matched across scrapers by your key field — so a broken scraper can’t silently delete rows or invent them.",
  },
  {
    n: "STEP 03",
    t: "Vote on every cell, not every scraper",
    d: "For each row-and-field pair the three values are clustered — numbers with a small tolerance — and the largest cluster with at least two members wins. Voting per cell means a scraper that gets prices wrong but names right only loses the price cells. Its good data survives, and you know precisely what broke.",
  },
  {
    n: "STEP 04",
    t: "Grade each scraper against the vote",
    d: "Healthy agreed everywhere. Dissenting was outvoted on some cells — the signature of silent corruption. Broken errored, returned nothing, or lost more than half its cells. That verdict is telemetry: it is what lets Quorum tell you which of your targets is rotting, and how fast.",
  },
  {
    n: "STEP 05",
    t: "Heal — and judge the repair with the same vote",
    d: "A losing scraper triggers Bright Data’s self-healing with a prompt composed from the disagreement itself. Bright Data returns a proposed fix plus a preview and waits at an approval gate. Quorum runs that preview through the same vote against the survivors: 90% match or better and it approves automatically, below that it rejects and retries with a sharper prompt. Two failures and a human is paged. Automatic, but never blind.",
  },
];

const FAQ = [
  {
    q: "Why three scrapers instead of one good one?",
    a: "Because a single scraper has no way to know it is wrong. It returns a number and the number looks like a number. Three scrapers that disagree have discovered something no individual scraper can: that the page and the extraction have come apart. Everything else Quorum does — silent-drift detection, verified healing, the volatility index — falls out of that one fact.",
  },
  {
    q: "Doesn’t that triple my scraping bill?",
    a: "It triples extraction, not engineering. The alternative is one scraper plus the person who notices it broke, works out what changed, rewrites the selector, and backfills the corrupted rows. Quorum is also selective: you can put a quorum on the feeds where wrong data is expensive and leave the rest on a single scraper.",
  },
  {
    q: "What actually counts as agreement?",
    a: "Values are normalized to their declared type first, then compared. Strings match after case and whitespace folding; numbers match within a small relative tolerance so 129.99 and 129.990 are the same value and 129.99 and 0.00 are not. A cell needs at least two of three scrapers in the same cluster to be emitted.",
  },
  {
    q: "What happens when all three disagree?",
    a: "Nothing is emitted for that cell and the row is flagged. No majority means no consensus, and Quorum would rather hand you a hole it has labelled than a number it cannot stand behind. The run is marked degraded and the repair loop starts on whichever variants drifted furthest from the others.",
  },
  {
    q: "How does this relate to Bright Data’s self-healing?",
    a: "Self-healing is the medicine. Quorum is the diagnosis and the second opinion. Bright Data’s CLI pauses a heal at an approval gate and returns a preview; most integrations pass --auto-approve and merge it unseen. Quorum never does. The surviving scrapers’ consensus is the approval brain, so a bad repair gets rejected and re-prompted instead of shipped.",
  },
  {
    q: "Can I run this on sites that fight back?",
    a: "The scrapers themselves are Bright Data collectors, so proxies, rendering, CAPTCHA and retries are their problem, not yours. Quorum sits above that layer: it commissions the collectors, runs them in parallel each cycle, and reconciles what comes back.",
  },
];

export default function Landing() {
  return (
    <>
      <SiteNav />

      <section className="hero">
        <div className="wrap">
          <div className="hero-grid">
            <div>
              <span className="eyebrow no-rule">
                <span className="hexpill" style={{ background: "var(--brand-soft)", color: "var(--brand)" }}>
                  The reliability layer for Bright Data scrapers
                </span>
              </span>
              <h1>
                No single scraper<br />is <span className="mark">trusted</span>.
              </h1>
              <p className="lede">
                Bright Data writes the scrapers, handles the hostile half of the web, and repairs them when they
                break. Quorum runs three of them against every URL and ships only what they agree on — so when a
                site changes, the survivors outvote the casualty and the breakage lands in your dashboard instead
                of in your data.
              </p>
              <div className="hero-cta">
                <a className="btn btn-lg" href="/dashboard">
                  <span>Open the console</span>
                  <span className="arrow">→</span>
                </a>
                <a className="btn btn-ghost btn-lg" href="#how">
                  <span>See how the vote works</span>
                </a>
              </div>
              <div className="trustbar">
                <span>3 scrapers per URL</span>
                <span className="dot" />
                <span>Cell-level majority vote</span>
                <span className="dot" />
                <span>Zero-human repair approval</span>
                <span className="dot" />
                <span>Built on Bright Data Scraper Studio</span>
              </div>
            </div>

            <Reveal delay={120}>
              <ConsensusEngine />
            </Reveal>
          </div>
        </div>
      </section>

      <section style={{ padding: "26px 0", borderTop: "1px solid var(--line-2)", borderBottom: "1px solid var(--line-2)", background: "var(--paper-2)" }}>
        <div className="wrap" style={{ marginBottom: 16 }}>
          <span className="eyebrow">Currently under quorum</span>
        </div>
        <div className="marquee">
          <div className="marquee-track">
            {[...UNDER_QUORUM, ...UNDER_QUORUM].map((s, i) => (
              <span className="marquee-item" key={i}>
                <span style={{ width: 5, height: 5, background: "var(--agree)", display: "inline-block" }} />
                {s}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="band" id="drift">
        <div className="wrap">
          <Reveal className="band-head">
            <span className="eyebrow">The failure nobody alerts on</span>
            <h2>A broken scraper doesn’t crash. It returns a number.</h2>
            <p>
              Hard failures are easy — the request 404s, the parser throws, someone gets paged. The expensive failure is
              the one that keeps returning valid-looking garbage: prices all zero, dates frozen, one field quietly
              swapped for its neighbour. Every monitor stays green. The damage is measured in weeks.
            </p>
          </Reveal>

          <Reveal delay={80}>
            <div className="panel plus-corners" style={{ borderColor: "var(--line-ink)", padding: 26 }}>
              <SilentDrift />
            </div>
          </Reveal>

          <div className="lattice lattice-3" style={{ marginTop: 40 }}>
            {[
              { i: "01", t: "Nothing throws", d: "The page still returns 200, the selector still matches something, and the pipeline still writes rows. There is no exception to catch." },
              { i: "02", t: "The shape looks right", d: "Schema validation passes. It’s a number where a number belongs. Type checks cannot tell you it’s the wrong number." },
              { i: "03", t: "Only a second opinion sees it", d: "Two scrapers that still work are the only thing on earth that can prove the third one has drifted. That is the entire idea." },
            ].map((c, i) => (
              <Reveal key={c.i} delay={i * 90} className="cell">
                <span className="idx">{c.i}</span>
                <h3>{c.t}</h3>
                <p>{c.d}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="band band-paper band-line">
        <div className="wrap">
          <Reveal className="band-head">
            <span className="eyebrow">Why they don’t all break together</span>
            <h2>One number. Three unrelated ways to find it.</h2>
            <p>
              Redundancy only helps if the copies fail for different reasons. Quorum writes each scraper under a
              different constraint, so the change that kills one is usually invisible to the others.
            </p>
          </Reveal>

          <div className="lattice lattice-3">
            {[
              { d: <StrategyCss />, t: "CSS selectors", p: "Targets class names and IDs. Fast, precise, and the first to die in a redesign.", tag: "brittle · exact" },
              { d: <StrategyText />, t: "Text anchors", p: "Banned from using classes. Finds values by the visible label next to them and by value shape. Sails through renames.", tag: "resilient · fuzzy" },
              { d: <StrategyDom />, t: "DOM structure", p: "Navigates by position within repeated containers. Survives renames, breaks when the markup is reordered.", tag: "structural" },
            ].map((s, i) => (
              <Reveal key={s.t} delay={i * 90} className="cell">
                <div style={{ border: "1px solid var(--line-2)", marginBottom: 18 }}>{s.d}</div>
                <h3>{s.t}</h3>
                <p>{s.p}</p>
                <span className="mono" style={{ display: "block", marginTop: 14, fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink-4)" }}>
                  {s.tag}
                </span>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="band" id="how">
        <div className="wrap">
          <Reveal className="band-head">
            <span className="eyebrow">How a cycle runs</span>
            <h2>From a pasted URL to a value you can defend.</h2>
            <p>Five steps, all of them automatic, none of them trusting a single source.</p>
          </Reveal>

          <div>
            {STEPS.map((s, i) => (
              <Reveal key={s.n} delay={i * 60} className="step">
                <div className="step-n">{s.n}</div>
                <div>
                  <h3>{s.t}</h3>
                  <p>{s.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="band band-paper band-line">
        <div className="wrap">
          <div className="hero-grid">
            <Reveal>
              <span className="eyebrow">The console</span>
              <h2 style={{ fontSize: "clamp(26px,3.4vw,36px)", margin: "16px 0 14px" }}>
                Disagreement is a first-class object.
              </h2>
              <p style={{ color: "var(--ink-3)", fontSize: 15, lineHeight: 1.65, marginBottom: 18 }}>
                Most tools show you the output. Quorum shows you the argument that produced it. Every disputed cell is
                marked in place, with the value each dissenting scraper proposed and the tally that overruled it — so a
                near-miss is visible long before it becomes an incident.
              </p>
              <ul style={{ listStyle: "none", display: "grid", gap: 11, marginBottom: 26 }}>
                {[
                  "Live variant health as each cycle runs",
                  "Consensus table with the dissent inlined",
                  "The healing ledger — every repair, its score, its verdict",
                  "Run history, so you can see a site starting to rot",
                ].map((t) => (
                  <li key={t} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13.5 }}>
                    <span style={{ color: "var(--agree)", fontFamily: "var(--mono)", fontSize: 12, marginTop: 1 }}>▸</span>
                    {t}
                  </li>
                ))}
              </ul>
              <a className="btn" href="/dashboard">
                <span>Open the console</span>
                <span className="arrow">→</span>
              </a>
            </Reveal>

            <Reveal delay={120}>
              <ConsolePreview />
            </Reveal>
          </div>
        </div>
      </section>

      <section className="band" id="healing">
        <div className="wrap">
          <Reveal className="band-head">
            <span className="eyebrow">Verified healing</span>
            <h2>Self-healing is a feature. Approving the heal is the hard part.</h2>
            <p>
              Bright Data can rewrite a broken scraper on its own — and it pauses at an approval gate, because merging a
              machine-written fix unseen is how you replace one silent failure with another. Quorum answers that gate
              with the only evidence that exists: the scrapers that didn’t break.
            </p>
          </Reveal>

          <Reveal delay={80}>
            <div className="panel plus-corners" style={{ borderColor: "var(--line-ink)", padding: "20px 26px 30px" }}>
              <HealLoop />
            </div>
          </Reveal>

          <div className="lattice lattice-2" style={{ marginTop: 40 }}>
            <Reveal className="cell">
              <span className="idx">THE COMMON WAY</span>
              <h3 style={{ color: "var(--ink-3)" }}>heal --auto-approve</h3>
              <p>
                The repair ships the moment it compiles. If the model misread the page, the pipeline now has a confident,
                well-formed, wrong scraper — and the approval gate that was supposed to catch it was waived by a flag.
              </p>
            </Reveal>
            <Reveal delay={90} className="cell" >
              <span className="idx">THE QUORUM WAY</span>
              <h3>heal → score → approve or reject</h3>
              <p>
                The preview is voted on against the survivors before anything is accepted. 94% match: approved, logged,
                back in rotation. 62% match: rejected, re-prompted with what it got wrong, and escalated if it fails
                twice. The verdict and its reasoning are written to the ledger either way.
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="band band-paper band-line">
        <div className="wrap">
          <Reveal className="band-head">
            <span className="eyebrow">Measured, not asserted</span>
            <h2>What survives a layout change.</h2>
            <p>
              We keep a store whose layout we can break on command — renamed classes, restructured DOM, removed fields,
              prices quietly set to zero — and replay every mutation against both setups.
            </p>
          </Reveal>

          <div className="hero-grid" style={{ alignItems: "start" }}>
            <Reveal>
              <div className="panel" style={{ borderColor: "var(--line-ink)", padding: 26 }}>
                <Survival />
              </div>
            </Reveal>

            <Reveal delay={100}>
              <div className="stats" style={{ gridTemplateColumns: "1fr 1fr" }}>
                <div className="stat-cell">
                  <div className="k"><Counter to={3} /></div>
                  <div className="v">scrapers per URL</div>
                  <div className="d">Independently generated, never sharing a selector.</div>
                </div>
                <div className="stat-cell">
                  <div className="k"><Counter to={100} suffix="%" /></div>
                  <div className="v">silent corruption caught</div>
                  <div className="d">The mutation class a lone scraper reports as success.</div>
                </div>
                <div className="stat-cell">
                  <div className="k"><Counter to={90} suffix="%" /></div>
                  <div className="v">approval threshold</div>
                  <div className="d">Preview-to-consensus match required to merge a repair.</div>
                </div>
                <div className="stat-cell">
                  <div className="k"><Counter to={0} /></div>
                  <div className="v">humans in the loop</div>
                  <div className="d">Until two repairs fail in a row — then you get paged.</div>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="band band-ink">
        <div className="wrap">
          <Reveal className="band-head">
            <span className="eyebrow" style={{ color: "rgba(239,239,236,.55)" }}>The layer underneath</span>
            <h2>Quorum doesn’t scrape. It decides what to believe.</h2>
            <p style={{ color: "rgba(239,239,236,.6)" }}>
              Describe a page in plain English and Bright Data’s Scraper Studio writes a working collector for it,
              then keeps it alive through proxies, rendering, CAPTCHA and retries — and rewrites it by itself when
              the markup moves. That is a genuinely hard problem, solved. Quorum commissions those collectors, runs
              them together, reconciles what comes back, and owns the one question a scraping platform is not in a
              position to answer for you: whether the result is right.
            </p>
          </Reveal>

          <div className="lattice lattice-2" style={{ background: "rgba(239,239,236,.16)", border: "1px solid rgba(239,239,236,.16)" }}>
            {[
              { c: "scraper create ×3", d: "One call per strategy, per target. Three collectors, three extraction philosophies, one output schema." },
              { c: "scraper run --json", d: "All variants launched in parallel each cycle. Their disagreements are the telemetry." },
              { c: "scraper heal", d: "Fired automatically when the vote confirms a variant broke, with a prompt written from the diff." },
              { c: "scraper approve / --reject", d: "Called by the consensus engine, not by a person and not by a flag. This is the whole product in one line." },
            ].map((x, i) => (
              <Reveal key={x.c} delay={i * 70} className="cell" >
                <div style={{ background: "var(--ink)", margin: -28, padding: 28 }}>
                  <code className="mono" style={{ fontSize: 13, color: "var(--marker)", display: "block", marginBottom: 10 }}>
                    {x.c}
                  </code>
                  <p style={{ color: "rgba(239,239,236,.6)" }}>{x.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="band" id="faq">
        <div className="wrap-narrow">
          <Reveal className="band-head" >
            <span className="eyebrow">Questions</span>
            <h2>The obvious objections.</h2>
          </Reveal>
          <Reveal delay={60}>
            <Faq items={FAQ} />
          </Reveal>
        </div>
      </section>

      <section className="band band-line" style={{ paddingTop: 78, paddingBottom: 78 }}>
        <div className="wrap">
          <Reveal>
            <div
              className="plus-corners"
              style={{
                border: "1px solid var(--line-ink)", background: "var(--card)", padding: "52px 40px", textAlign: "center",
              }}
            >
              <h2 style={{ fontSize: "clamp(26px,3.6vw,40px)", marginBottom: 14 }}>
                Paste a URL. Get three opinions.
              </h2>
              <p style={{ color: "var(--ink-3)", fontSize: 16, maxWidth: "56ch", margin: "0 auto 28px" }}>
                Pick your fields, and Quorum commissions the flock, runs the first cycle, and starts keeping score.
              </p>
              <a className="btn btn-lg" href="/dashboard">
                <span>Open the console</span>
                <span className="arrow">→</span>
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      <footer className="site-foot">
        <div className="wrap">
          <div className="foot-grid">
            <div>
              <Logo size={28} href={null} />
              <p style={{ color: "var(--ink-3)", fontSize: 13.5, marginTop: 14, maxWidth: "38ch", lineHeight: 1.65 }}>
                The reliability layer for Bright Data scrapers. Redundancy, a vote, and a repair loop that has to
                earn its merge.
              </p>
            </div>
            <div className="foot-col">
              <h4>Product</h4>
              <a href="/dashboard">Console</a>
              <a href="/how-it-works">How consensus works</a>
              <a href="#healing">Verified healing</a>
              <a href="#faq">FAQ</a>
            </div>
            <div className="foot-col">
              <h4>Built with</h4>
              <span>Bright Data Scraper Studio</span>
              <span>Bright Data Collector API</span>
              <span>Next.js · TypeScript</span>
              <span>Postgres telemetry</span>
            </div>
          </div>
          <div className="foot-bottom">
            <span>QUORUM · THE RELIABILITY LAYER FOR BRIGHT DATA SCRAPERS</span>
            <span>NO SINGLE SCRAPER IS TRUSTED</span>
          </div>
        </div>
      </footer>
    </>
  );
}
