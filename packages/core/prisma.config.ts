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
    // Migrations only. This config is read by the Prisma CLI; the runtime client builds
    // its own connection in src/prisma.ts from DATABASE_URL.
    //
    // That split matters on Neon (and any PgBouncer setup): the app wants the pooled
    // endpoint, but the migration engine needs a direct one — through the pooler it
    // fails with "migration persistence is not initialized", because transaction
    // pooling cannot hold the session-level advisory lock migrations take out.
    url: env(process.env.DIRECT_DATABASE_URL ? "DIRECT_DATABASE_URL" : "DATABASE_URL"),
  },
});
