export type FieldType = "string" | "number" | "integer";

/** Canonical output schema for a target: field name -> type. */
export type TargetSchema = {
  keyField: string;
  fields: Record<string, FieldType>;
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
