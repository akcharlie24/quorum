# ◎ QUORUM — No Single Scraper Is Trusted

> **Scrape-Verse Hackathon (WeMakeDevs × Bright Data) — deadline Aug 23, 2026**
> Product name: **QUORUM** (was SILK — renamed 2026-08-23; internal package names stay `@silk/*`).
> UI theme: light, technical-drawing — paper ground, hairline rules, zero radius, hand-drawn annotations.

---

## 1. The Pitch

`scraper heal` is the medicine. **SILK is the nervous system** that knows *when* to take it, *verifies the cure worked*, and *learns which sites get sick*.

Everyone at this hackathon will demo healing. We demo:
1. **Knowing when to heal** — including the silent failures healing alone never sees.
2. **Proving the heal worked** — consensus-verified: SILK programmatically approves or rejects Bright Data's proposed fix. Zero-human self-healing.
3. **Predicting the next break** — a live "web rot" index built from our own telemetry.

**Narrative for judges:** *"Self-healing is a feature. We built the reliability layer around it."*

## 2. The Three Layers (one closed loop)

### 🕷️ Layer 2 — The Flock (Consensus Scrapers) → VERIFY & HEAL — **BUILDING FIRST**
"RAID for scrapers." Each target site gets **N scraper variants** generated with deliberately different extraction strategies (CSS-selector-based, text-anchored, structural). They run in parallel; field-level **majority vote** produces the canonical output.
- When the site changes, some variants break while others survive.
- Survivors' consensus = **ground truth**: it confirms an alarm is real (not a legit data change), and it validates `heal`'s proposed fix.
- **The killer mechanic (verified against BD docs):** `scraper heal` by default *pauses at an approval gate* and returns `status: "awaiting_approval"` with a preview of the fixed output. SILK compares that preview to Flock consensus and then runs `scraper approve` (or `approve --reject`) **programmatically**. We deliberately do NOT use `--auto-approve` — *our consensus engine is the approval brain.* That's the whole product in one sentence.

### 🕸️ Layer 1 — Spider-Sense (Silent-Drift Sentry) → DETECT
The worst scraper failure isn't a crash — it's a scraper that keeps returning valid-looking garbage (prices all $0, dates frozen, a field silently swapped). Hard failures are obvious; silent drift triggers nothing. Spider-Sense fixes that:
- Every run, each field's output is checked against a statistical fingerprint: null rate, type check, value-distribution deviation vs the last K runs.
- Catches both hard breaks AND semantic drift; fires Discord/Slack alerts with a before/after diff.

### 📰 Layer 3 — Daily Bugle (Web Volatility Index) → LEARN
Every detection, breakage, and heal event is telemetry. Aggregated → a live "web rot" leaderboard:
- Volatility score per site (breakages per run), mean-time-to-detect, mean-time-to-heal.
- The dashboard's hero page AND the LinkedIn post. Free byproduct of Layers 1+2 — just a view over the telemetry table.

## 3. How We Use Bright Data (verified against docs.brightdata.com)

**CLI:** `@brightdata/cli` (npm, Node ≥ 20). Binary is `brightdata` or `bdata` (interchangeable). Auth: `brightdata login --api-key <KEY>` or `export BRIGHTDATA_API_KEY=...` (the env-var route is what SILK's runner uses). Verify with `brightdata config` + `brightdata budget`.

| Command / API | Where SILK uses it | Notes |
|---|---|---|
| `bdata scraper create <url> "<description>"` | Flock generation: called N times per target with different strategy descriptions → N Collector IDs (`c_*`) | ⚠️ **Takes 5–15 min each (up to 25 for complex sites).** Kick off all creations EARLY and in parallel — this is wall-clock, not work |
| `bdata scraper run <collector_id> [url] --json -o <file>` | The runner executes all variants each cycle | BD handles proxies, rendering, CAPTCHA, retries — we never write that plumbing |
| `bdata scraper heal <collector_id> "<prompt>"` | Triggered automatically when consensus confirms a variant broke | Default = pauses at approval gate, returns `awaiting_approval` + preview. `--timeout 600`, `--json` |
| `bdata scraper approve <collector_id> [--reject]` | **SILK's consensus verdict decides this call.** Preview matches consensus → approve; doesn't → reject + re-heal with a better prompt | The demo's money shot |
| `POST https://api.brightdata.com/dca/trigger?collector=<id>&queue_next=1` → `{collection_id}` then poll `GET /dca/dataset?id=<id>` | Dashboard "Run now" button + scheduled runs, using Collector-as-API (Bearer token auth) | Judges explicitly asked to see this pattern. 1–10 URLs ≈ 30–90s |
| `brightdata budget` | Shown in dashboard footer (credits burn-down = nice touch) | Optional |

**What Akshat provides NOW (Phase 1 needs it immediately):**
1. Bright Data account with the hackathon credits (+$50 promo code if available) and API token (Account Settings → API Tokens).
2. `npm install -g @brightdata/cli` && `bdata login --api-key <token>` (or just give me the token and I'll use `BRIGHTDATA_API_KEY`).

## 4. Build Order — Flock first (riskiest + most differentiating), demo always in mind

**Principle: the demo is the product.** The 90-second demo arc must work before anything is polished.

### 🔨 Phase 1 — The Flock, end to end (Layer 2) ← WE ARE HERE
The demo-target site is part of this phase — Flock development *needs* a site we can break on purpose.

- [x] **1a. Breakage Lab** (`apps/demo-target`) — *not a demo prop, a measuring instrument.* "WebHead Gear" store, 8 products. Layouts: v1 clean · v2 redesign (renamed classes + restructured DOM) · v3 silent corruption (prices $0, stock 999). **Its job is the benchmark**: you cannot measure "1 scraper survives X% of layout changes, a Flock survives Y%" without a site whose mutations you control. Belongs on the Benchmarks page, NOT the demo's opening act. Mutate = edit `layout.config.json` + redeploy. ⏳ Vercel deploy pending `vercel login`.
- [x] **1b. CLI wrapper** (`packages/core/src/brightdata.ts`): create/run/heal/approve via child process, defensive `--json` parsing, error taxonomy. ⚠️ JSON shapes unverified until first real calls.
- [x] **1c. Flock generator**: `silk flock <url> <name>` — 3 parallel creates (css / text-anchor / structural prompts in `strategies.ts`), variants persisted in SQLite.
- [x] **1d. Runner + consensus** (`runner.ts`, `consensus.ts`): parallel runs, normalization + coercion, field-level majority vote with numeric tolerance, verdicts (healthy/dissenting/broken), full telemetry. **7/7 unit tests pass.**
- [x] **1e. Heal loop** (`healer.ts`): auto-composed heal prompt from consensus diff → heal → preview scored vs consensus (≥90% → approve, else reject + 1 sharper retry → needs_human). All lifecycle in `heal_events`.
- [x] **1f. CLI proof**: `silk flock/run/watch/status` via `npm run silk --`.

**Phase 1 exit criterion = the core demo works headless:** break demo site → variant fails vote → heal → consensus-approved → pipeline output never corrupted.

### ✅ Phase 1.5 — Flock Control Room (dashboard) — BUILT
Pulled forward from Phase 2: the product is a UI where you paste **any real URL** and watch a Flock work. Demo-target site is demoted to a benchmark instrument (see below).
- [x] **Next.js dashboard** (`apps/dashboard`, port 3939), dark Spider-Man theme, three routes: `/` (spin up + Flock list), `/flock/[name]` (control room), `/how-it-works` (the consensus explainer — doubles as judge-facing documentation).
- [x] **URL-in flow**: paste URL + name + field schema (name/type/key, presets for Products / Job posts / Articles) → Flock builds in the background.
- [x] **Background job layer** (`jobs.ts`, `orchestrator.ts`): `scraper create` runs 5–25 min, far past any HTTP timeout, so creation and cycles run as jobs with live logs polled by the UI.
- [x] **Control room**: variant cards (strategy + collector id + healthy/dissenting/broken), **consensus table with disputed cells highlighted inline** ("CSS variant said 0.00"), healing ledger (approved/rejected + match score + the actual prompt), run-history strip, Run cycle / Scrape only buttons.
- [x] **Dynamic per-target schema** — arbitrary sites, not just the demo store.
- [x] `seed-demo.ts` — populates a full breakage-and-heal story into the UI without burning Bright Data credits.

### Phase 2 — Spider-Sense + Daily Bugle (Layers 1+3)
- [ ] **2a. Drift engine**: per-field fingerprints (null rate, type, deviation vs last K runs) over the telemetry DB Phase 1 already populates.
- [ ] **2b. Discord/Slack webhook alerts** with before/after diff (~1 hour).
- [ ] **2c. Daily Bugle page**: volatility leaderboard across all targets, MTTD/MTTH, credits burn-down.

### Phase 3 — Real target sites
- [ ] Pick 2 real sites (see §5), generate their Flocks, let them run on a schedule so the dashboard shows real history.

### Phase 4 — Benchmarks + polish
- [ ] **Mutation benchmark suite** (§6) + benchmarks page in dashboard.
- [ ] UI polish (Suit-Up), README + clean module boundaries (Spider-Sense track), landing page (LAST).
- [ ] Record backup demo video. Daily Bugle LinkedIn post draft.

## 5. Target Websites (to decide — suggestions)

Rules: public data only, no auth/paywalls, avoid the 800+ pre-built-scraper sites, prefer ugly/volatile HTML where self-healing earns its keep.

| Candidate | Why | Risk |
|---|---|---|
| **Agmarknet / mandi (agri market) prices** | Classic ugly gov site, socially-useful data, India angle, zero pre-built scrapers | Slow/flaky pages |
| **State e-procurement tender listings** | Worst-built HTML on the internet = perfect showcase; real market value | Heavy ASP.NET postbacks |
| **University notice boards / results pages** | Constantly restructured, relatable | Low "wow" factor |
| **Niche/local e-commerce (regional grocery chain)** | Price + net-quantity fields → shrinkflation angle | Semi-common category |
| **Our own Vercel demo site** | REQUIRED — the only site that breaks on cue | None |

**Plan: 2 real sites + demo site = 3 targets × 3 variants = 9 scrapers.**

## 6. Benchmarks (the "we measured it" slide)

Built as a **mutation test suite**: saved HTML snapshots of targets + scripted mutations, replayed against all variants.

Mutation types: class/id renames · DOM restructure · field removal · **silent value corruption** (price → 0, stale dates) · pagination change.

| Metric | What it proves |
|---|---|
| Survival rate: single scraper vs Flock-of-3, per mutation type | Redundancy works |
| Silent-corruption detection rate (Spider-Sense on vs off) | Drift detection catches what healing alone misses |
| MTTD / MTTH (mean time to detect / heal) | The loop is fast |
| Heal approval accuracy: consensus verdict vs manual judgment | Zero-human healing is safe |

## 7. Demo Script (~2 min — build toward THIS)

Lead with the **real product on a real site**. The Breakage Lab appears only as evidence, at the end.

1. **Real URL, live.** Paste a real target URL into SILK, pick the fields, hit *Spin up Flock*. Three scrapers start building on Bright Data. *(15s)*
   → Because creation takes 5–25 min, have a **pre-built Flock on the same real site** ready to switch to. Never wait on stage.
2. **The control room.** Pre-built Flock: three variants green, consensus table of real scraped data, run history. "One URL, three scrapers, three different extraction philosophies." *(25s)*
3. **Silent corruption is the real enemy.** Show a disputed cell inline: consensus says 129.99, the CSS variant said 0.00 — *a single scraper would have shipped that zero and never raised an error.* This is the moment that sells the product. *(25s)*
4. **Verified healing.** Healing ledger: Bright Data proposed a fix → SILK scored the preview against consensus → first attempt **rejected at 62%**, retry **approved at 100%**, no human. "We don't use `--auto-approve`. Our consensus IS the approval." *(30s)*
5. **Proof, not vibes.** Benchmarks page from the Breakage Lab: single scraper vs Flock survival per mutation type, silent-corruption detection rate, MTTH. *(25s)*

## 8. Prize Track Mapping

- **Web-Slinger** (best BD usage): create ×N, run in parallel, heal + **programmatic approve/reject**, Collector-as-API via `/dca/trigger`, budget API.
- **Suit-Up** (best UI): Spider-Man-themed reliability dashboard.
- **Spider-Sense** (cleanest code): runner / consensus / drift / telemetry as separate modules.
- **Daily Bugle** (LinkedIn): the volatility index findings post.

## 9. Stack

- **TypeScript everywhere.** Next.js (App Router) dashboard + API routes; `better-sqlite3` telemetry DB; `packages/core` for CLI-wrapper/consensus/drift/runner logic; demo target = tiny Next/static site on Vercel.
- Repo layout: `apps/dashboard`, `apps/demo-target`, `packages/core`, `bench/`.

## 10. Risks & Mitigations

- **Scraper creation latency (5–25 min each)** → kick off all `scraper create` calls the moment credits land; build other things while they bake.
- **Heal latency (docs say fixes can take up to ~15 min)** → demo uses a pre-rehearsed mutation whose heal we've already timed; backup video recorded.
- **429 rate caps on heal** → CLI has built-in retry (`--max-retries`); serialize heals per collector.
- **Docs vs kickoff-blog drift** (blog says `bdata`, docs say `brightdata` — verified: both work, same binary).

## 10a. PROVEN ON LIVE DATA (IMDb Top 250, 2026-08-22/23)

**The Flock works.** Two independently generated scrapers (structural, text-anchor) each extract the full
**250-movie chart with correct ratings** — Shawshank 9.3, Godfather 9.2, Dark Knight 9.1 — verified against
the real chart. Consensus emits 250 clean rows. **The pipeline never emitted bad data at any point tonight.**

**The silent failure is real and unstaged.** The `css` variant returns ~12,000 rows, correct ratings, valid
JSON, exit code 0, no error — and **every title blank**. A single-scraper pipeline ingests that as success.
Two other scrapers supplied real titles and outvoted it. This is the product thesis, caught in the wild.

**Coverage is capped by the second-best scraper, by design.** A row needs 2 independent confirmations, so
when one variant saw 250 and another 75, we emitted 75. Consensus is precision-first: it would rather emit
fewer rows that two scrapers confirmed than more rows resting on one unverified source.

### The headline finding: Bright Data's heal previews do not reflect deployed behaviour
Twice, on two different collectors, `scraper heal` returned `awaiting_approval` with a preview showing
**100% correct rows** — and the approved, deployed scraper still failed. Our three-stage check caught it:

| stage | what it checks | outcome |
|---|---|---|
| 1. Consensus vote | do independent scrapers agree? | caught the blank-title failure |
| 2. Preview scoring | is the proposed fix accurate + plausibly complete? | 4 rejections, 2 approvals |
| 3. Production verification | does the deployed scraper actually work? | **caught an approved fix that didn't** |

**This validates the whole project: you cannot trust a self-healing system's own report that it healed.**

Live heal ledger (real audit trail, all programmatic, no human):
- `#6 rejected` — preview claims only 25 of ~250 rows
- `#7 rejected` — preview claims only 2 of ~75 rows
- `#9 rejected` — preview contained no usable rows
- `#10 rejected` — preview claims only 2 of ~250 rows
- `#11 approved` at 100% precision, claims 250 → **`regressed`: still broken on run #23**

### Additional platform findings (all learned by running it)
1. **Descriptions cap at ~500 chars**, undocumented — longer gives instant `400 Invalid description` and leaves a half-built collector (no programmatic delete).
2. **AI-Flow caps generation at 3 concurrent builds** account-wide (`Cannot run more than 3 jobs in parallel`). One Flock at a time; 15 at once destroyed a whole round.
3. **Generated scrapers crawl to detail pages by default** unless explicitly forbidden — returns recommendation carousels, not the listing.
4. **Values come back structured** (`{value, currency, symbol}`), and rows arrive nested under a container key.
5. **Heal previews are truncated inconsistently** — sometimes `"N more items"`, often silently. Unmeasurable cardinality must be treated as unknown, not insufficient.
6. **The CLI drives generation; it does not merely poll.** Killing it after the trigger leaves an empty collector that 403s at run time.
7. **Build times**: ~6.4 min alone vs ~24.5 min with nine queued.

## 11. Status Log

- **2026-08-23 (later):** UI follow-ups plus a stack upgrade, still on `ui-tweaks`.
  - **Stack:** Next **16.3.2** on Turbopack (was 15 on webpack), React 19.2, **Tailwind CSS v4** and **shadcn/ui** primitives (Radix Select + Tooltip, `cn()`, CVA, lucide-react, `tw-animate-css`). The hand-authored design system moved to `app/design-system.css` and is imported `layer(components)`, with its tokens re-exported through `@theme inline` — so Tailwind utilities (in `@layer utilities`) override component CSS without `!important`, and every colour still has one source of truth.
  - **`packages/core` relative imports now name `.ts`, not `.js`.** Turbopack has no equivalent of webpack's `extensionAlias`, and core's NodeNext-style `./x.js` specifiers pointed at files that do not exist on disk. Core is never compiled (tsx for the CLI, bundled by Next), so `allowImportingTsExtensions` is the honest fix. 12/12 tests and the `silk` CLI verified unchanged.
  - **Run history redesigned** as a proper stacked column chart (`components/run-history.tsx`): status palette validated for CVD separation, hairline gridlines, 24px-capped bars with a 2px surface gap between segments, ticks centred on their gridline, a labelled legend, per-cycle hover/focus tooltips, and a screen-reader table so no value is gated behind hover.
  - **Bugs fixed:** `.site-links a` (specificity 0,1,1) was outranking `.btn`, flattening the nav CTA's padding to `3px 0` *and* replacing its hover fill with an underline — now scoped `:not(.btn)`. The `.plus-corners` registration marks were rebuilt: an absolutely-positioned pseudo lays out against the *padding* box, so the panel's 1px border pushed every mark a pixel off-centre, and drawing them in `rgba(32,30,42,.55)` against a solid-ink border made each corner read as two misregistered lines with arms poking into the panel. They now offset by `arm − border-width` and wear `--line-ink`, so a corner is one continuous cross — the panel's own rules overshooting by 6px. The hero diagram's scraper→vote connectors swapped `strokeDasharray` mid-phase and jumped twice; they are now two stacked paths where only opacity animates. The logomark is `overflow: visible` so its hover pulse is not clipped, and the nav logo scrolls home smoothly instead of re-navigating.

- **2026-08-23:** **Renamed SILK → QUORUM** and rebuilt the front end light-mode on branch `ui-tweaks`.
  - The name is the mechanic: a quorum is the minimum agreement that makes a decision valid — exactly "at least 2 of 3 must agree." The codebase already spoke this language (`verdict`, `dissenting`, majority vote, approve/reject), so the brand now matches the engine. Logomark: three overlapping circles with a solid dot where all three meet. Only the **user-facing** surface was renamed — npm workspaces stay `@silk/*`, the CLI stays `silk`, the DB stays `silk.db`, so nothing in the pipeline had to change.
  - **New marketing landing page at `/`**; the console moved to `/dashboard`, with `/flock/[name]` and `/how-it-works` unchanged and now inside an `(app)` route group that owns the console chrome.
  - **Design system rewritten** (`app/globals.css`, ~540 lines) in a light technical-drawing register — paper `#efefec` ground, ink `#201e2a`, zero border radius, hairline lattices, corner registration marks, halftone/dot textures, hexagonal status tags. Type: Space Grotesk display · DM Sans body · JetBrains Mono labels · Caveat for hand annotations, loaded by CSS `@import` so a build never depends on the font CDN.
  - **Five original SVG illustrations**, all reused between the landing page and the console so the marketing claims and the product are literally the same drawings: the animated six-phase consensus engine (hero), the three extraction philosophies as page wireframes, the silent-drift chart, the verified-healing loop, and the survival-per-mutation bars.
  - Animations are subtle and everywhere: scroll reveals, marching-ants on disputed cells, drawn SVG strokes, a marquee of live targets, count-ups, hover lifts with hard offset shadows, and a `prefers-reduced-motion` block that disables all of it.
  - Console behaviour is untouched — same polling, same API routes, same job/orchestrator flow. Typecheck and `next build` clean.

- **2026-08-22 (am):** Idea locked (Flock + Spider-Sense + Volatility Index = SILK). PROJECT.md created.
- **2026-08-22 (pm):** Verified real BD CLI surface from docs — `scraper create/run/heal/approve` with approval gate + `--reject`; SILK's consensus becomes the programmatic approval brain (stronger than planned!). Build order flipped per Akshat: **Flock (Layer 2) first**, incl. demo-target site; Spider-Sense + Bugle after. Waiting on: BD API token to start `scraper create` bakes.
- **2026-08-22 (later):** API key in `.env` ✅; `bdata` CLI v0.3.5 installed, auth confirmed via `zones` (budget endpoint needs admin scope — harmless). **Entire Phase 1 core built and committed**: demo site (3 layouts), BD wrapper, telemetry DB, consensus (7/7 tests), heal-approve loop, `silk` CLI.
- **2026-08-22 (evening):** Akshat: *"a demo website with html is childish — I need a real product UI where I paste any URL."* Correct. **Dashboard pulled forward and built** (Phase 1.5): paste-a-URL → Flock builds in background → control room with consensus table, inline disputed cells, healing ledger, run history. Demo-target site **reframed as the Breakage Lab** — a measuring instrument for benchmarks, not the demo's opener. Demo script rewritten to lead with a real site. Verified end-to-end against seeded data; typechecks clean.
  - ✅ **Bright Data integration PROVEN.** First real scraper created end-to-end: `c_mt4exizofwxzuq9od` on books.toscrape.com, status `done`, ~10 min, ~162 poll cycles. Pipeline steps observed: `prepare_intent_analyzer → planner → discovery → collector_mainatiner → output_schema_generator → code_generator → input_schema_generator → preview_runner → preview_picker`. Response JSON: `{collector_id, name, status, completed_steps[], view_url, created_at}` — our parser handles it.
  - The earlier 403 was **only** the budget endpoint (needs admin token scope) and `bdata scrape` needs a Web Unlocker zone — **neither blocks Scraper Studio**, which is the entire path SILK uses. Account is good.
  - **Three real-world gotchas found by running it (all fixed, all worth putting in the README / LinkedIn post):**
    1. **Descriptions are capped at ~500 chars, undocumented.** Longer → instant `400 Invalid description`, and it still leaves a half-built collector behind (BD has no programmatic delete). Established by probe: 500 ✅ / 560 ❌. `MAX_DESCRIPTION` now enforced in `strategies.ts` + `brightdata.ts`.
    2. **Values come back structured, not scalar** — a price arrived as `{value: 51.77, currency: "GBP", symbol: "£"}`. Variants wrap differently, so consensus needs `unwrapScalar()` before comparing or every variant "disagrees" over formatting.
    3. **Default output is one row, not the listing.** The first collector returned a single book from a 20-book page. Prompts must explicitly demand every item; a Flock voting over one row is worthless.
  - Prompts are also flattened to ASCII (`sanitizePrompt`) before sending.
- **2026-08-22 (night):** Five Flocks launched on real named sites (IMDb Top 250, Steam Top Sellers, GitHub Trending, IKEA desks, books.toscrape control). **All 15 scrapers built successfully** — but the first consensus cycles came back all-broken on every target, which exposed the biggest gotcha yet:
    4. **Generated scrapers crawl to detail pages by default.** The IMDb collector visited each of the top 25 title pages and returned each one's *recommendation carousel* nested under a `movies` key, plus `product_page_url` + `input` metadata — never the listing itself. Their build pipeline has a `discovery` step that hunts for detail pages unless told not to. Fixes: prompts now say *"Read ONLY this page. Do not follow links or open individual X pages"* and demand a flat top-level array; `flattenRows()` also recovers rows wrapped in a container key so a wrapping scraper is degraded, not written off. **This was universal — books.toscrape failed the same way — so it is a platform default, not a site quirk.**
  - **Detached creation** (`createScraperDetached`): the CLI prints the collector id right after it triggers AI generation, then merely polls. We now capture the id at trigger time and kill the process — **collector ids land in ~90s instead of ~25min**, and a dropped connection can no longer lose one. Flocks can be rebuilt in place (`replace: true` retires old variants, keeping their history).
  - ⏱ **Build-time reality**: a lone scraper builds in ~10 min; nine concurrently took ~24.5 min each. Bright Data queues them, so parallelism buys less than expected — launch Flocks well ahead of any demo.
  - Tests: **12/12 pass**, including a regression test built from the real nested IMDb payload.
