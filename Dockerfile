# Quorum runs as one long-lived container, not as serverless functions.
#
# Two hard requirements rule out Vercel/Netlify for this app:
#   1. It shells out to the Bright Data CLI (`bdata`) as a child process, with run
#      timeouts up to 180 minutes. Serverless caps out in single-digit minutes.
#   2. Flock builds and run cycles continue working AFTER the HTTP response returns
#      (see jobs.ts). Serverless freezes the instance the moment you respond.
FROM node:24-slim

# openssl is Prisma's runtime dependency; ca-certificates is for the Bright Data API.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# The Bright Data CLI must be on PATH — brightdata.ts spawns the bare `bdata` binary.
RUN npm install -g @brightdata/cli@^0.3.5

COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY apps/dashboard/package.json apps/dashboard/
COPY apps/demo-target/package.json apps/demo-target/

# packages/core's postinstall runs `prisma generate`, which needs the schema and a
# syntactically valid DATABASE_URL — the real one is injected at run time.
COPY packages/core/prisma packages/core/prisma
COPY packages/core/prisma.config.ts packages/core/
COPY tsconfig.base.json ./
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"

# --ignore-scripts skips better-sqlite3's node-gyp build. That package is a leftover of
# the SQLite-to-Postgres migration and is imported only by the one-off script that did
# it; nothing at runtime touches it, and compiling it would need a full toolchain here.
# Prisma's client is then generated explicitly, since that postinstall is skipped too.
RUN npm ci --ignore-scripts \
 && npx prisma generate --config packages/core/prisma.config.ts

COPY . .
RUN npm run build --workspace @silk/dashboard

ENV NODE_ENV=production
EXPOSE 3939

# Migrations run at release, not at build: the database only exists at run time.
CMD ["sh", "-c", "npm run db:deploy && npm run start --workspace @silk/dashboard"]
