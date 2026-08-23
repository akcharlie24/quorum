import { readFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, env } from "prisma/config";

// The Prisma 7 CLI no longer reads .env files itself — load the repo-root .env
// (same precedence rules as src/env.ts: real env vars win).
try {
  const text = readFileSync(join(import.meta.dirname, "../../.env"), "utf8");
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
  }
} catch {
  /* no .env — rely on real env vars */
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
});
