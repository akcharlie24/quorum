export type FieldType = "string" | "number" | "integer";

/** Canonical output schema for a target: field name -> type. */
export type TargetSchema = {
  keyField: string;
  fields: Record<string, FieldType>;
  /** What one row represents, e.g. "product", "job posting". Used in scraper prompts. */
  itemLabel?: string;
  /** Optional extra instruction from the user about what to extract. */
  description?: string;
  /**
   * Explicit page URLs to scrape instead of crawling from one listing page.
   * Handing Bright Data the item pages directly stops its planner inventing a
   * discovery crawl — which on Steam fetched ~150 pages per run and returned nothing.
   */
  urls?: string[];
};

export type Row = Record<string, unknown>;

export type VariantStrategy = "css" | "text-anchor" | "structural";

export type VariantRunStatus = "healthy" | "dissenting" | "broken";

export interface VariantRunResult {
  variantId: number;
  status: VariantRunStatus;
  rows: Row[];
  error?: string;
  /** fields where this variant was outvoted, as "rowKey.field" */
  dissents: string[];
}

export interface ConsensusResult {
  rows: Row[]; // the canonical dataset the pipeline emits
  verdicts: VariantRunResult[];
  votes: VoteRecord[];
}

export interface VoteRecord {
  rowKey: string;
  field: string;
  consensusValue: unknown;
  dissenting: { variantId: number; value: unknown }[];
}
