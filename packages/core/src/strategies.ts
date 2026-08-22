import type { TargetSchema, VariantStrategy } from "./types.js";

/**
 * Bright Data rejects `scraper create` with 400 "Invalid description" past roughly this
 * length. Undocumented — established by probing: 500 accepted, 560 rejected.
 * Prompts are built to fit inside it, trimming the user's optional instruction first.
 */
export const MAX_DESCRIPTION = 500;

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

const STRATEGY_CLAUSE: Record<VariantStrategy, string> = {
  css: "Locate values using CSS class names and element IDs.",
  "text-anchor":
    "Do not use CSS class names or IDs; locate values by nearby visible text labels and value patterns.",
  structural:
    "Locate values by DOM structure and child order within repeated containers, not by class names.",
};

function fieldList(schema: TargetSchema): string {
  return Object.entries(schema.fields)
    .map(([name, type]) => `${name} (${type === "integer" ? "integer" : type})`)
    .join(", ");
}

/**
 * Three deliberately different extraction philosophies for the same schema.
 * Decorrelated failure modes are what let the Flock outvote a breakage.
 */
export function strategyPrompts(schema: TargetSchema): Record<VariantStrategy, string> {
  const item = (schema.itemLabel?.trim() || "item").slice(0, 30);
  const fields = fieldList(schema);
  const extra = schema.description?.trim();

  const build = (strategy: VariantStrategy, withExtra: boolean): string =>
    [
      `Listing page with many ${item}s.`,
      withExtra && extra ? extra : "",
      `Return EVERY ${item} on the page as a separate JSON object, not just the first.`,
      `Fields: ${fields}.`,
      `Use these exact field names. Each value must be a plain number or string, never a nested object. Use null if missing.`,
      STRATEGY_CLAUSE[strategy],
    ]
      .filter(Boolean)
      .join(" ");

  const out = {} as Record<VariantStrategy, string>;
  for (const strategy of Object.keys(STRATEGY_CLAUSE) as VariantStrategy[]) {
    // Drop the user's optional instruction before truncating anything structural.
    let prompt = build(strategy, true);
    if (prompt.length > MAX_DESCRIPTION) prompt = build(strategy, false);
    out[strategy] = prompt.slice(0, MAX_DESCRIPTION).trim();
  }
  return out;
}
