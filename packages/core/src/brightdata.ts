import { execFile, spawn } from "node:child_process";
import { MAX_DESCRIPTION } from "./strategies.ts";
import { readFileSync, unlinkSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface CliResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  json: unknown | null; // best-effort parse of the last JSON value in stdout
  exitCode: number;
  /** true when WE killed the process on timeout — the output carries no clue that we did */
  timedOut: boolean;
}

export type BdError = "broken" | "empty" | "timeout" | "rate_limited" | "network" | "no_credit";

function extractJson(text: string): unknown | null {
  // CLI mixes progress lines with JSON; grab the last {...} or [...] block.
  const starts: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{" || text[i] === "[") starts.push(i);
  }
  for (const s of starts) {
    try {
      return JSON.parse(text.slice(s).trim());
    } catch {
      /* keep scanning */
    }
  }
  return null;
}

export function runCli(
  args: string[],
  timeoutMs = 180_000,
): Promise<CliResult> {
  return new Promise((resolve) => {
    execFile(
      "bdata",
      args,
      { timeout: timeoutMs, env: process.env, maxBuffer: 64 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const e = err as (NodeJS.ErrnoException & { killed?: boolean; signal?: string; code?: unknown }) | null;
        const exitCode = e && typeof e.code === "number" ? (e.code as number) : err ? 1 : 0;
        resolve({
          ok: !err,
          stdout: stdout ?? "",
          stderr: stderr ?? "",
          json: extractJson(stdout ?? ""),
          exitCode,
          // execFile reports a timeout kill only here; stdout looks like an ordinary
          // truncated log, so without this a timeout is misread as a scraper failure.
          timedOut: !!e?.killed || e?.signal === "SIGTERM",
        });
      },
    );
  });
}

export function classifyError(res: CliResult): BdError {
  // We killed it: that is our impatience, whatever the log happens to say.
  if (res.timedOut) return "timeout";
  const text = (res.stdout + res.stderr).toLowerCase();
  // An exhausted account is a billing state, not a defect in the scraper.
  if (
    text.includes("insufficient") ||
    text.includes("no credit") ||
    text.includes("out of credit") ||
    text.includes("payment") ||
    text.includes("quota exceeded") ||
    text.includes("balance")
  ) {
    return "no_credit";
  }
  if (text.includes("429") || text.includes("rate limit")) return "rate_limited";
  // Our own connectivity failing is not the scraper's fault — healing it would be
  // both wasteful and dangerous, since a healthy scraper could be "fixed" into a
  // broken one on the strength of an outage.
  if (
    text.includes("fetch failed") ||
    text.includes("econnreset") ||
    text.includes("enotfound") ||
    text.includes("econnrefused") ||
    text.includes("socket hang up") ||
    text.includes("network")
  ) {
    return "network";
  }
  if (text.includes("timed out") || text.includes("timeout")) return "timeout";
  return "broken";
}

/**
 * Failures caused by our side of the wire, which must never trigger a heal.
 * Timeouts count: a batch job we stopped waiting for is our impatience, not a defect
 * in the scraper, and healing it would rewrite working code.
 */
export function isInfrastructureFailure(error: string | undefined): boolean {
  return (
    !!error &&
    (error.startsWith("network") ||
      error.startsWith("rate_limited") ||
      error.startsWith("timeout") ||
      error.startsWith("no_credit"))
  );
}

const COLLECTOR_RE = /c_[a-z0-9]{6,}/i;

export function sanitizePrompt(text: string): string {
  return text
    .replace(/[‐-―]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function createScraper(
  url: string,
  description: string,
  timeoutMs = 30 * 60_000,
): Promise<{ collectorId: string; raw: CliResult }> {
  const desc = sanitizePrompt(description).slice(0, MAX_DESCRIPTION);
  const res = await runCli(
    ["scraper", "create", url, desc, "--json"],
    timeoutMs,
  );
  const fromJson = JSON.stringify(res.json ?? "").match(COLLECTOR_RE)?.[0];
  const fromText = (res.stdout + res.stderr).match(COLLECTOR_RE)?.[0];
  const collectorId = fromJson ?? fromText ?? "";
  if (!collectorId) {
    throw new Error(
      `scraper create returned no collector id (exit ${res.exitCode}):\n${res.stdout}\n${res.stderr}`,
    );
  }
  return { collectorId, raw: res };
}

/**
 * Builds a scraper, reporting the collector id early via `onAccepted` but waiting for
 * generation to finish before resolving.
 *
 * Do NOT be tempted to kill the CLI once the id appears: it drives the generation
 * pipeline step by step rather than merely polling it. Detaching leaves an empty
 * collector that fails at run time with 403 "Collector does not have a template".
 * The process must stay alive for the full 10-25 minutes.
 */
export function createScraperAwaited(
  url: string,
  description: string,
  onAccepted?: (collectorId: string) => void,
  timeoutMs = 40 * 60_000
): Promise<{ collectorId: string }> {
  const desc = sanitizePrompt(description).slice(0, MAX_DESCRIPTION);
  return new Promise((resolve, reject) => {
    const child = spawn("bdata", ["scraper", "create", url, desc, "--json"], {
      env: process.env,
    });
    let out = "";
    let settled = false;
    let announced = false;

    const finish = (err: Error | null, collectorId?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { child.kill("SIGKILL"); } catch { /* already gone */ }
      if (err) reject(err);
      else resolve({ collectorId: collectorId! });
    };

    const failed = () =>
      /Invalid description|ai_trigger_failed|Failed to start AI generation|does not have a template/.test(out);

    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString();
      if (!announced) {
        const id = out.match(COLLECTOR_RE)?.[0];
        if (id) {
          announced = true;
          onAccepted?.(id);
        }
      }
    });
    child.stderr.on("data", (chunk: Buffer) => { out += chunk.toString(); });
    child.on("error", (e) => finish(e));

    child.on("close", () => {
      const id = out.match(COLLECTOR_RE)?.[0];
      // "status":"done" is the only signal that generation actually completed.
      const done = /"status"\s*:\s*"done"/.test(out);
      if (id && done && !failed()) return finish(null, id);
      finish(new Error(`build did not complete: ${out.replace(/.*polling \(attempt[^\n]*\n/gs, "").slice(-300)}`));
    });

    const timer = setTimeout(() => finish(new Error("scraper build timed out")), timeoutMs);
  });
}

/** Run a scraper; returns extracted rows. */
export async function runScraper(
  collectorId: string,
  url?: string,
  // Heavy pages (Steam) exceed Bright Data's realtime limit and fall back to batch
  // mode; observed collections have outlived 75 minutes. Cutting a batch job short
  // marks a working scraper broken, so we wait far longer than realtime ever needs.
  timeoutMs = 180 * 60_000
): Promise<{ rows: unknown[]; raw: CliResult }> {
  const dir = mkdtempSync(join(tmpdir(), "silk-run-"));
  const outFile = join(dir, "out.json");
  const args = ["scraper", "run", collectorId];
  if (url) args.push(url);
  args.push("--json", "-o", outFile);
  const res = await runCli(args, timeoutMs);

  let rows: unknown[] = [];
  try {
    const parsed = JSON.parse(readFileSync(outFile, "utf8"));
    rows = Array.isArray(parsed)
      ? parsed
      : (parsed?.data ?? parsed?.results ?? []);
  } catch {
    // fall back to stdout JSON
    const j = res.json;
    if (Array.isArray(j)) rows = j;
    else if (j && typeof j === "object") {
      const obj = j as Record<string, unknown>;
      rows = (obj.data as unknown[]) ?? (obj.results as unknown[]) ?? [];
    }
  } finally {
    try {
      unlinkSync(outFile);
    } catch {
      /* ignore */
    }
  }
  if (!Array.isArray(rows)) rows = [];
  return { rows, raw: res };
}

export interface HealResponse {
  status: string; // e.g. "awaiting_approval"
  preview: unknown[]; // sample rows of the fixed output
  /** Rows the preview says it omitted ("223 more items"); previews are truncated. */
  truncatedCount: number;
  raw: CliResult;
}

/** Bright Data truncates heal previews with a literal "N more items" entry. */
export function extractTruncatedCount(preview: unknown): number {
  const m = JSON.stringify(preview ?? "").match(/(\d+)\s+more items/);
  return m ? Number(m[1]) : 0;
}

/** Trigger self-healing. Default gate: returns awaiting_approval + preview. Never --auto-approve. */
export async function healScraper(
  collectorId: string,
  prompt: string,
  timeoutMs = 20 * 60_000,
): Promise<HealResponse> {
  const res = await runCli(
    ["scraper", "heal", collectorId, prompt, "--json", "--timeout", "900"],
    timeoutMs,
  );
  const j = (res.json ?? {}) as Record<string, unknown>;
  // The live field is `preview_result`; the others are kept as fallbacks.
  const preview =
    [j.preview_result, j.preview, j.data, j.sample].find((v): v is unknown[] => Array.isArray(v)) ?? [];
  return {
    status: String(j.status ?? (res.ok ? "unknown" : "error")),
    preview,
    truncatedCount: extractTruncatedCount(preview),
    raw: res,
  };
}

/** Commit or reject a pending heal. THE consensus verdict lands here. */
export async function approveHeal(
  collectorId: string,
  opts: { reject?: boolean } = {},
  timeoutMs = 15 * 60_000,
): Promise<CliResult> {
  const args = [
    "scraper",
    "approve",
    collectorId,
    "--json",
    "--timeout",
    "600",
  ];
  if (opts.reject) args.push("--reject");
  return runCli(args, timeoutMs);
}
