/**
 * A tiny in-process TTL cache for read queries.
 *
 * The console polls, so the same expensive read runs over and over against a database
 * that has not changed. The Daily Bugle is the worst case: one query loop per target
 * plus a JSON parse of every stored consensus dataset, recomputed on every page view.
 *
 * In-process is the right scope here — the app runs as a single container (see the
 * Dockerfile), so a shared cache would add a network hop to save a network hop. It is
 * cached on globalThis so Next's dev hot-reload does not silently reset it.
 */

interface Entry {
  value: unknown;
  expires: number;
  /** Set while a refresh is in flight so concurrent pollers share one query. */
  inflight?: Promise<unknown>;
}

const g = globalThis as typeof globalThis & { __silkCache?: Map<string, Entry> };
const store: Map<string, Entry> = g.__silkCache ?? new Map();
g.__silkCache = store;

/**
 * Returns the cached value, or computes and caches it.
 *
 * Concurrent callers that miss together share a single in-flight promise rather than
 * each firing their own query — without that, four pollers arriving at once on a cold
 * cache produce four identical Bugle aggregations.
 */
export async function cached<T>(key: string, ttlMs: number, compute: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);

  if (hit && hit.expires > now) return hit.value as T;
  if (hit?.inflight) return hit.inflight as Promise<T>;

  const inflight = compute()
    .then((value) => {
      store.set(key, { value, expires: Date.now() + ttlMs });
      return value;
    })
    .catch((e) => {
      // Never cache a failure, and never leave a poisoned in-flight promise behind.
      store.delete(key);
      throw e;
    });

  store.set(key, { value: hit?.value, expires: 0, inflight });
  return inflight as Promise<T>;
}

/** Drops cache entries after a write, so the UI reflects an action immediately. */
export function invalidate(prefix?: string): void {
  if (!prefix) return void store.clear();
  for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k);
}
