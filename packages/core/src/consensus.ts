import type {
  ConsensusResult,
  Row,
  TargetSchema,
  VariantRunResult,
  VoteRecord,
} from "./types.ts";

const NUM_TOLERANCE = 0.011; // price cents tolerance

/**
 * Bright Data often returns structured values rather than scalars — a price arrives as
 * {value: 51.77, currency: "GBP", symbol: "£"}. Different variants wrap values differently,
 * so unwrapping to the underlying scalar is what makes them comparable at all.
 */
const SCALAR_KEYS = ["value", "amount", "price", "text", "name", "title", "raw", "content"];

export function unwrapScalar(value: unknown): unknown {
  if (Array.isArray(value)) return value.length ? unwrapScalar(value[0]) : null;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const k of SCALAR_KEYS) {
      const v = obj[k];
      if (typeof v === "number" || typeof v === "string" || typeof v === "boolean") return v;
    }
    for (const v of Object.values(obj)) {
      if (typeof v === "number" || typeof v === "string") return v;
    }
    return null;
  }
  return value;
}

/** Coerce a raw scraped value to the schema type. "$129.99" -> 129.99, "In stock: 12" -> 12. */
export function coerce(raw: unknown, type: "string" | "number" | "integer"): unknown {
  const value = unwrapScalar(raw);
  if (value === null || value === undefined) return null;
  if (type === "string") return String(value).trim();
  const s = String(value).replace(/,/g, "");
  const m = s.match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  if (Number.isNaN(n)) return null;
  return type === "integer" ? Math.round(n) : n;
}

/** Case-insensitive field lookup so "Price"/"price"/"product_price" all map to `price`. */
function lookupField(src: Record<string, unknown>, field: string): unknown {
  if (field in src) return src[field];
  const lower = field.toLowerCase();
  for (const k of Object.keys(src)) {
    const kl = k.toLowerCase();
    if (kl === lower || kl.endsWith(`_${lower}`) || kl === `product_${lower}`) return src[k];
  }
  return undefined;
}

/**
 * Some generated scrapers wrap their rows inside a container key rather than
 * returning a flat array (observed: `[{movies: [...], product_page_url, input}]`).
 * When a top-level object carries none of the schema's fields but holds an array of
 * objects that do, treat that inner array as the rows.
 */
export function flattenRows(raw: unknown[], schema: TargetSchema): Record<string, unknown>[] {
  const fields = Object.keys(schema.fields);
  const out: Record<string, unknown>[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const src = item as Record<string, unknown>;
    if (fields.some((f) => lookupField(src, f) !== undefined)) {
      out.push(src);
      continue;
    }
    for (const value of Object.values(src)) {
      if (!Array.isArray(value)) continue;
      const nested = value.filter(
        (x): x is Record<string, unknown> =>
          !!x && typeof x === "object" && fields.some((f) => lookupField(x as Record<string, unknown>, f) !== undefined)
      );
      out.push(...nested);
    }
  }
  return out;
}

export function normalizeRows(raw: unknown[], schema: TargetSchema): Row[] {
  const rows: Row[] = [];
  for (const src of flattenRows(raw, schema)) {
    const lookup = (field: string): unknown => lookupField(src, field);
    const row: Row = {};
    for (const [field, type] of Object.entries(schema.fields)) {
      row[field] = coerce(lookup(field), type);
    }
    rows.push(row);
  }
  return rows;
}

export function rowKeyOf(row: Row, schema: TargetSchema): string {
  return String(row[schema.keyField] ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function valuesEqual(a: unknown, b: unknown, type: string): boolean {
  if (a === null || a === undefined || b === null || b === undefined) return a === b;
  if (type === "number" || type === "integer") {
    return Math.abs(Number(a) - Number(b)) <= NUM_TOLERANCE;
  }
  return String(a).toLowerCase().replace(/\s+/g, " ").trim() ===
    String(b).toLowerCase().replace(/\s+/g, " ").trim();
}

interface VariantInput {
  variantId: number;
  rows: Row[]; // already normalized
  error?: string;
}

/**
 * Field-level majority vote across variants.
 * A variant is: broken (error / no rows / missing most rows), dissenting (outvoted on fields),
 * or healthy. Consensus needs >= 2 agreeing variants per (row, field).
 */
export function consensus(inputs: VariantInput[], schema: TargetSchema): ConsensusResult {
  const fields = Object.entries(schema.fields);
  const byVariant = new Map<number, Map<string, Row>>();
  const allKeys = new Set<string>();

  for (const inp of inputs) {
    const map = new Map<string, Row>();
    for (const row of inp.rows) {
      const key = rowKeyOf(row, schema);
      if (key) map.set(key, row);
    }
    byVariant.set(inp.variantId, map);
    for (const k of map.keys()) allKeys.add(k);
  }

  // Row keys recognized by a majority of non-erroring variants define the canonical row set.
  const contributors = inputs.filter((i) => !i.error && byVariant.get(i.variantId)!.size > 0);
  const majorityCount = Math.floor(inputs.length / 2) + 1;
  const canonicalKeys = [...allKeys].filter(
    (k) => contributors.filter((i) => byVariant.get(i.variantId)!.has(k)).length >= Math.min(majorityCount, contributors.length)
  );

  const consensusRows: Row[] = [];
  const votes: VoteRecord[] = [];
  const dissentsByVariant = new Map<number, string[]>(inputs.map((i) => [i.variantId, []]));
  const missingByVariant = new Map<number, number>(inputs.map((i) => [i.variantId, 0]));

  for (const key of canonicalKeys) {
    const out: Row = {};
    for (const [field, type] of fields) {
      // gather each variant's value for this (row, field)
      const entries = inputs
        .map((i) => {
          const row = byVariant.get(i.variantId)!.get(key);
          return { variantId: i.variantId, present: !!row, value: row ? row[field] : undefined };
        });

      // cluster equal values, pick the largest cluster with >= 2 members
      const clusters: { value: unknown; members: number[] }[] = [];
      for (const e of entries) {
        if (!e.present) continue;
        const cluster = clusters.find((c) => valuesEqual(c.value, e.value, type));
        if (cluster) cluster.members.push(e.variantId);
        else clusters.push({ value: e.value, members: [e.variantId] });
      }
      clusters.sort((a, b) => b.members.length - a.members.length);
      const winner = clusters[0];
      const hasMajority = winner && winner.members.length >= 2;

      out[field] = hasMajority ? winner.value : (winner?.value ?? null);

      const dissenting: { variantId: number; value: unknown }[] = [];
      for (const e of entries) {
        if (!e.present) {
          missingByVariant.set(e.variantId, (missingByVariant.get(e.variantId) ?? 0) + 1);
          continue;
        }
        if (hasMajority && !winner.members.includes(e.variantId)) {
          dissenting.push({ variantId: e.variantId, value: e.value });
          dissentsByVariant.get(e.variantId)!.push(`${key}.${field}`);
        } else if (hasMajority && (e.value === null || e.value === undefined) && winner.value !== null) {
          // null that somehow clustered with winner shouldn't happen; guard anyway
        }
      }
      if (dissenting.length > 0 || !hasMajority) {
        votes.push({ rowKey: key, field, consensusValue: out[field], dissenting });
      }
    }
    consensusRows.push(out);
  }

  const totalCells = canonicalKeys.length * fields.length || 1;
  const verdicts: VariantRunResult[] = inputs.map((i) => {
    const dissents = dissentsByVariant.get(i.variantId)!;
    const missing = missingByVariant.get(i.variantId)!;
    let status: VariantRunResult["status"] = "healthy";
    if (i.error || byVariant.get(i.variantId)!.size === 0 || missing / totalCells > 0.5) {
      status = "broken";
    } else if (dissents.length > 0 || missing > 0) {
      status = "dissenting";
    }
    return { variantId: i.variantId, status, rows: i.rows, error: i.error, dissents };
  });

  return { rows: consensusRows, verdicts, votes };
}
