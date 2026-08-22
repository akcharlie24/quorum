import type {
  ConsensusResult,
  Row,
  TargetSchema,
  VariantRunResult,
  VoteRecord,
} from "./types.js";

const NUM_TOLERANCE = 0.011; // price cents tolerance

/** Coerce a raw scraped value to the schema type. "$129.99" -> 129.99, "In stock: 12" -> 12. */
export function coerce(value: unknown, type: "string" | "number" | "integer"): unknown {
  if (value === null || value === undefined) return null;
  if (type === "string") return String(value).trim();
  const s = String(value).replace(/,/g, "");
  const m = s.match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  if (Number.isNaN(n)) return null;
  return type === "integer" ? Math.round(n) : n;
}

export function normalizeRows(raw: unknown[], schema: TargetSchema): Row[] {
  const rows: Row[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const src = item as Record<string, unknown>;
    // case-insensitive field lookup so "Price"/"price"/"product_price" variants still map
    const lookup = (field: string): unknown => {
      if (field in src) return src[field];
      const lower = field.toLowerCase();
      for (const k of Object.keys(src)) {
        const kl = k.toLowerCase();
        if (kl === lower || kl.endsWith(`_${lower}`) || kl === `product_${lower}`) return src[k];
      }
      return undefined;
    };
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
