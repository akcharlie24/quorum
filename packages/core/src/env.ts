import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

// Walk up from cwd to find the workspace root. Works from the CLI, from tests,
// and from the Next.js dashboard (which runs with cwd=apps/dashboard).
function findRepoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "tsconfig.base.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

export const REPO_ROOT = process.env.SILK_ROOT ?? findRepoRoot();

// Minimal .env loader — real env vars take precedence.
export function loadEnv(): void {
  let text: string;
  try {
    text = readFileSync(join(REPO_ROOT, ".env"), "utf8");
  } catch {
    return;
  }
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
  }
}
