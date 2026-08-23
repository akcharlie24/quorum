import { PrismaPg } from "@prisma/adapter-pg";
import { loadEnv } from "./env.ts";
import { PrismaClient } from "./generated/prisma/client.ts";

loadEnv();

function createClient(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set — add it to .env (see .env.example)");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}

// One client per process. Next.js dev re-evaluates modules on hot reload, so the
// instance is cached on globalThis to avoid leaking connection pools.
const g = globalThis as typeof globalThis & { __silkPrisma?: PrismaClient };

export const prisma: PrismaClient = g.__silkPrisma ?? createClient();
g.__silkPrisma = prisma;
