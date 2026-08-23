# QUORUM

**The reliability layer for Bright Data scrapers.**

Bright Data writes the scrapers, handles the hostile half of the web, and repairs them when
they break. Quorum runs three of them against every URL, ships only what they agree on, and
grades every self-healing repair before it goes live.

> *Built for the WeMakeDevs × Bright Data Scrape-Verse hackathon.*

```
5 sites  ·  15 scrapers  ·  29 cycles  ·  4,100 cells voted
628 readings overruled  ·  6 drift signals  ·  11 repairs judged, 8 rejected
```

---

## The problem

A scraper that crashes is a good scraper. It tells you.

The expensive failure is the one that returns a number. The request 200s, the selector still
matches something, the schema still validates, and the pipeline writes rows all day. Prices
are zero, a date is frozen, one field has quietly swapped places with its neighbour. Every
monitor is green. You find out six weeks later, from someone downstream, and then you get to
explain it.

Self-healing is the medicine for that. **Quorum is the nervous system that knows when to take
it, verifies the cure worked, and learns which sites keep getting sick.**

Everyone at this hackathon can demo `scraper heal`. We demo the three things around it:

1. **Knowing when to heal** — including the silent failures healing alone never sees
2. **Proving the heal worked** — consensus decides `approve` vs `--reject`, with no human
3. **Predicting the next break** — a volatility index built from our own telemetry

---

## Three layers, one closed loop

```
   ┌─────────────── LAYER 2 · THE FLOCK ───────────────┐
   │  3 scrapers → normalize → weight → vote           │
   │  detects DISAGREEMENT                             │
   │  ↓ heal → score the preview → approve or reject   │
   │  ↓ verify the fix in production                   │
   └───────────────────┬───────────────────────────────┘
                       │ consensus dataset + verdicts
   ┌───────────────────▼─── LAYER 1 · SPIDER-SENSE ────┐
   │  fingerprint this run vs the last 6               │
   │  detects CHANGE the vote is blind to              │
   │  fleet_wide = every scraper agreed and was wrong  │
   └───────────────────┬───────────────────────────────┘
                       │ every run, verdict, heal, signal
   ┌───────────────────▼─── LAYER 3 · DAILY BUGLE ─────┐
   │  volatility per site · detect + heal latency      │
   │  heal trust: approved vs actually verified        │
   └───────────────────────────────────────────────────┘
```

These are not three features stacked up. Layer 1's key output is a **function of** Layer 2's
verdicts, and Layer 3 is the integral of both. Each fails alone:

- **The Flock alone** ships `$0.00` with three green cards. Nothing disagreed.
- **Spider-Sense alone** can't tell "the site broke" from "the site changed" — that call
  needs the Flock's verdicts.
- **The Bugle alone** has nothing to aggregate.

---

## Layer 2 — The Flock

*"RAID for scrapers."* Every target gets **three scrapers generated from the same output
schema but deliberately incompatible instructions**, so the change that kills one is usually
invisible to the others.

| strategy | instruction | fails when |
|---|---|---|
| `css` | locate values by class names and IDs | a redesign renames classes |
| `text-anchor` | forbidden from classes; find values by visible labels and value shape | labels are reworded |
| `structural` | navigate by DOM position within repeated containers | markup is reordered |

Decorrelated failure is the whole point. Redundancy only helps if the copies fail for
different reasons.

### How a cycle runs

`packages/core/src/runner.ts`, in execution order:

1. **Run** — three collectors fire in parallel against the same URLs
2. **Normalize** — `"$129.99"` → `129.99`, `{value: 51.77, currency: "GBP"}` → `51.77`;
   field names fuzzy-matched so `product_price` and `Price` land in the same slot
3. **Weight** — each variant is scored on how often it has agreed with consensus over the
   last 10 runs (Laplace-smoothed, floored at 0.25)
4. **Vote** — field-level majority
5. **Record and ship** — the consensus dataset is clean regardless of what happens next
6. **Spider-Sense** — Layer 1 runs here
7. **Verify past heals** — is that "fixed" variant actually healthy now?
8. **Heal the losers** — only variants that lost the vote

### Three voting rules learned the hard way

**Rows need two independent confirmations.** Precision over coverage. When one variant saw
250 IMDb rows and another saw 75, we emitted 75 — Quorum would rather give you fewer rows
that two scrapers confirmed than more rows resting on one unverified source.

**Null abstains rather than votes.** A null is a *failed extraction*, not a claim that the
value is absent. Counting it as a vote lets two scrapers that found nothing outvote one that
found the truth. Observed live: `css` read Stardew Valley at `14.99` while the other two
returned null, and the majority shipped null. Absence of evidence is not evidence of absence.

**Reputation breaks ties.** A 1-1 split was previously decided by insertion order. On IKEA
one scraper read `99.99` and another `99`, and the correct value won by luck. Now the variant
with the better track record wins — reputation tilts a close call, it never grants a veto.

### Verified healing — the part that matters

A losing variant triggers `scraper heal` with a prompt composed from the disagreement itself.
Bright Data returns a proposed fix and **pauses at an approval gate**.

Most integrations pass `--auto-approve` and merge it unseen. **Quorum never does.** The
preview is scored against the surviving scrapers' consensus: ≥90% match approves, below that
rejects and retries with a sharper prompt, two failures pages a human.

*The consensus engine is the approval brain.* That is the product in one sentence.

---

## Layer 1 — Spider-Sense

### The one idea

Every detector has an axis. Layer 2 measures **across scrapers**. Layer 1 measures
**across time**.

```
                 across scrapers  →
                 css   text   struct
across    run 1   9.3   9.3    9.3      Layer 2 reads a ROW: do they agree?
time      run 2   9.3   9.3    9.3      Layer 1 reads a COLUMN: did it move?
  ↓       run 3   0.0   0.0    0.0
```

On run 3 the row is unanimous. Layer 2 reports `healthy` — **correctly**, because all three
scrapers read the page accurately. The page really does say `0.0`. They are each right about
the page and all wrong about the world.

Only the column shows anything wrong. Consensus is *structurally* blind here, and so is
`heal`: nothing threw, so there is nothing to repair.

### What a signal is

Each cycle, `fingerprint()` reduces the consensus dataset to statistics — not the data, its
shape. `detectDrift()` compares that against the mean of the **last 6 finished runs**, and
refuses to judge with fewer than 2 runs of history.

| kind | threshold | catches |
|---|---|---|
| `row_count_drop` | rows < 50% of typical | pagination changed, listing collapsed |
| `null_spike` | null rate +30pp | a field started coming back empty |
| `field_vanished` | null rate ≥ 99% | a field stopped extracting entirely |
| `value_collapse` | stddev → 0, was varying | **every row reports the same value** |
| `distribution_shift` | mean moved > 3σ | currency swap, locale change, real repricing |

**`fleet_wide`** is the field that matters. Set from `isFleetWide()` when every variant came
back healthy, it is the sentence *"the vote could not possibly have caught this"* stored as a
boolean — and it decides the response:

- **One scraper drifted** → the markup moved. Heal it, automatically.
- **All scrapers drifted together** → the *site* moved. Healing is the wrong answer; there is
  nothing broken to repair. Raise an alarm and let a human look.

Two smaller rules that matter in practice:

- **Fires once**, on the transition into alarm — a field that vanished three runs ago is not
  three pieces of news. It resolves when the signal stops, which makes "currently open" a
  number you can trust.
- **Never fails the run.** A second opinion that can break the thing it is commenting on is
  worse than none.

### It costs nothing

Drift reads consensus datasets already in Postgres. **Zero Bright Data credits, zero extra
requests, no added load on the target site.** It was backfilled across all 29 historical runs
retroactively — which is why running it every cycle is a non-decision.

---

## Layer 3 — The Daily Bugle

A volatility index over telemetry Layers 1 and 2 already write. No scraping, no credits, no
new data collection.

**Live index:**

| site | volatility | runs |
|---|---|---|
| `imdb-top-250` | 44 | 13 |
| `github-repos` | 33 | 1 |
| `steam-prices` | 31 | 3 |
| `ikea-desks` | 30 | 6 |
| `seed-demo-store` | 11 | 6 |

The composite is **rendered decomposed** into its four weighted contributions — breakage 40,
drift 30, disputes 20, heals 10 — so the number is auditable rather than asserted. Every row
prints its sample size, because with single-digit run counts these are indicative, not
authoritative, and the page says so.

Also tracked: detection latency (we detect within the cycle that produced the fault, so cycle
time *is* detection time), heal latency, and the heal-trust ratio — approvals versus
approvals that actually held in production.

---

## What we found running this for real

### Bright Data's heal previews do not always reflect deployed behaviour

Twice, on two different collectors, `scraper heal` returned `awaiting_approval` with a preview
showing **100% correct rows** — and the approved, deployed scraper still failed. Our
three-stage check caught it:

| stage | checks | outcome |
|---|---|---|
| 1. Consensus vote | do independent scrapers agree? | caught a blank-title failure |
| 2. Preview scoring | is the proposed fix accurate and plausibly complete? | 8 rejected, 3 approved |
| 3. Production verification | does the *deployed* scraper actually work? | **caught an approved fix that didn't** |

**You cannot trust a self-healing system's own report that it healed.** That single
`regressed` row is the argument for this entire project.

### The silent failure is real and unstaged

On IMDb, the `css` variant returned ~12,000 rows, correct ratings, valid JSON, exit code 0,
no error — and **every title blank**. A single-scraper pipeline ingests that as success. Two
other scrapers supplied real titles and outvoted it.

### Drift found real history

Replaying Spider-Sense over all 29 stored runs surfaced 5 genuine IMDb events, including run
#15 where the dataset fell to **0 rows** and both `title` and `rating` went 100% empty. All
five have since resolved.

**Honest caveat:** none of the real signals were fleet-wide — every drift we found on live
sites was also visible to the vote. The fleet-wide case in the console is the seeded demo
store, where the *site* serves `$0` and all three scrapers agree. That scenario is
manufactured; the mechanism and code path are the production ones, and the IMDb signals are
real.

### Platform findings, all learned by running it

1. **Descriptions cap at ~500 characters**, undocumented — longer gives an instant
   `400 Invalid description` and leaves a half-built collector behind
2. **Generation caps at 3 concurrent builds account-wide** — 15 at once destroyed a whole round
3. **Generated scrapers crawl to detail pages by default** unless explicitly forbidden
4. **Values come back structured** (`{value, currency, symbol}`), and rows arrive nested under
   a container key
5. **Heal previews are truncated inconsistently** — unmeasurable cardinality must be treated
   as unknown, not insufficient
6. **The CLI drives generation, it does not merely poll** — killing it after the trigger leaves
   an empty collector that 403s at run time
7. **Naming pages beats letting the planner discover them** — on a listing URL it repeatedly
   built a crawler that fetched ~150 pages and returned nothing

---

## How Bright Data is used

| Command / API | Where |
|---|---|
| `scraper create <url> "<description>"` ×3 | Flock generation — one call per strategy |
| `scraper run <id> --json` | Every cycle, all variants in parallel |
| `scraper heal <id> "<prompt>"` | Fired automatically when the vote confirms a break |
| `scraper approve <id>` / `--reject` | **Called by the consensus engine.** Never `--auto-approve` |
| `POST /dca/trigger?collector=<id>` | Collector-as-API for multi-URL batching |

Proxies, rendering, CAPTCHA, retries and the scrapers themselves are Bright Data's job.
Quorum commissions them, runs them together, reconciles what comes back, and owns the one
question a scraping platform is not in a position to answer for you: **whether the result is
right.**

---

## Architecture

```
packages/core/src/
  consensus.ts    the vote — clustering, tolerance, abstention, weighting   (pure)
  drift.ts        fingerprints, thresholds, dedupe rule                     (pure)
  volatility.ts   the Bugle's scoring rules and result shapes               (pure)
  strategies.ts   the three extraction prompts + description budgeting      (pure)
  brightdata.ts   CLI wrapper — create / run / heal / approve, error taxonomy
  runner.ts       one cycle: run → weight → vote → record → drift → verify → heal
  healer.ts       heal prompt composition and preview scoring
  sentry.ts       drift persistence and alert lifecycle
  bugle.ts        volatility aggregation queries
  queries.ts      dashboard read side + per-flock summaries
  cache.ts        TTL cache for read queries
  db.ts jobs.ts orchestrator.ts prisma.ts   persistence and background jobs

apps/dashboard    Next.js 16 console — flock control room, Daily Bugle, explainer
apps/demo-target  the Breakage Lab: a store whose layout we can break on command
```

**The pure/impure split is deliberate.** Every rule you would want to argue about — how a tie
is broken, when drift is real, what makes a site volatile — lives in a module with no database
access and a unit test. **35 tests**, no mocks, no fixtures beyond plain objects.

**Stack:** TypeScript · Next.js 16 (Turbopack) · React 19 · Tailwind 4 · Prisma 7 · Postgres

---

## Running it

**Prerequisites:** Node ≥ 20, Docker (for Postgres), a Bright Data API key

```bash
git clone https://github.com/akcharlie24/silk && cd silk
npm install

cp .env.example .env        # set DATABASE_URL and BRIGHTDATA_API_KEY
npm install -g @brightdata/cli

cd packages/core && npx prisma migrate deploy && cd ../..
npm run seed:demo           # a full breakage-and-heal story, no credits spent

cd apps/dashboard && npm run dev     # http://localhost:3939
```

### Useful commands

```bash
npm run silk -- flock <url> <name>   # commission a flock from the CLI
npm run silk -- run <name>           # one cycle
npm run silk -- status               # fleet health

npm run db:backfill -- --reset       # replay drift over stored runs (free)
npx tsx packages/core/scripts/replay.ts --write   # re-vote stored runs after a rule change

npx tsx --test packages/core/test/*.test.ts
```

`replay.ts` and `backfill-drift.ts` both operate on data already captured, so a change to the
voting or drift rules can be validated against real scraped output without paying to scrape
it again.

### Deploying

`Dockerfile` and `render.yaml` are included. It runs as **one long-lived container, not
serverless** — the app shells out to the Bright Data CLI with run timeouts up to 180 minutes,
and background jobs continue after the HTTP response returns. Neither survives a serverless
function.

On Neon or any PgBouncer setup, set `DIRECT_DATABASE_URL` to the non-pooled endpoint:
migrations cannot run through a transaction pooler.

---

## Prize tracks

- **Web-Slinger** — `create` ×N, parallel `run`, `heal`, and **programmatic `approve`/`--reject`
  driven by consensus**; Collector-as-API via `/dca/trigger`
- **Suit-Up** — a light, technical-drawing console where disagreement is a first-class object
- **Spider-Sense** — pure rule modules with unit tests, separated from all I/O
- **Daily Bugle** — the volatility index, and the findings above

---

*No single scraper is trusted.*
