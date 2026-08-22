import type { TargetSchema, VariantStrategy } from "./types.js";

export const STRATEGY_LABEL: Record<VariantStrategy, string> = {
  css: "CSS selectors",
  "text-anchor": "Text anchors",
  structural: "DOM structure",
};

export const STRATEGY_BLURB: Record<VariantStrategy, string> = {
  css: "Targets class names and IDs — fast and precise, first to die in a redesign.",
  "text-anchor": "Forbidden from using classes; finds values by visible text and patterns. Survives redesigns.",
  structural: "Navigates by DOM shape and position — survives renames, breaks on reordering.",
};

function schemaClause(schema: TargetSchema): string {
  const item = schema.itemLabel?.trim() || "item";
  const fields = Object.entries(schema.fields)
    .map(([name, type]) =>
      type === "number"
        ? `${name} (number, digits only — no currency symbols or units)`
        : type === "integer"
          ? `${name} (integer, digits only)`
          : `${name} (string)`
    )
    .join(", ");
  const extra = schema.description?.trim() ? ` ${schema.description.trim()}` : "";
  return (
    `Extract every ${item} listed on the page.${extra} ` +
    `Return one JSON object per ${item} with exactly these fields: ${fields}. ` +
    `Use these exact field names. If a value is missing, return null for it. `
  );
}

/**
 * Three deliberately different extraction philosophies for the same schema.
 * Decorrelated failure modes are what let the Flock outvote a breakage.
 */
export function strategyPrompts(schema: TargetSchema): Record<VariantStrategy, string> {
  const base = schemaClause(schema);
  return {
    css:
      base +
      "Strategy: rely on the page's CSS class names and element IDs as selectors wherever possible.",
    "text-anchor":
      base +
      "Strategy: do NOT rely on CSS class names or element IDs at all — they change often on this site. " +
      "Locate each value by nearby visible text labels and recognizable value patterns instead " +
      "(for example currency amounts, text following a label like 'Rating:', or phrases such as 'in stock').",
    structural:
      base +
      "Strategy: rely on the DOM structure and element positions — repeated container elements in the " +
      "main content region, and the order of child elements within each container — rather than specific " +
      "class names or IDs.",
  };
}
