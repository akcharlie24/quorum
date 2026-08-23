import type { TargetSchema, VariantStrategy } from "./types.ts";

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
  // An outright ban on class selectors made Bright Data's generator fail outright
  // ("AI generation finished with status error"), so this steers rather than forbids.
  "text-anchor":
    "Prefer locating values by visible text labels and value patterns (currency amounts, labelled fields) rather than by class names.",
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

  /**
   * Clauses in reading order, each with a priority. When the prompt exceeds the
   * description cap we drop whole low-priority clauses rather than slicing the tail —
   * a blind slice used to cut the strategy clause mid-word, which is the one part that
   * makes the three variants differ at all.
   */
  // Given explicit page URLs, each page describes ONE item — asking for a list there
  // is what made Steam return {"games": []} five builds running.
  const perPage = (schema.urls?.length ?? 0) > 0;

  const clauses = (strategy: VariantStrategy): { text: string; priority: number }[] => perPage ? [
    { text: `Each page describes ONE ${item}.`, priority: 0 },
    { text: extra ?? "", priority: 5 },
    { text: `Return a single JSON object for the ${item} on the page, not an array and not nested.`, priority: 1 },
    { text: `Fields: ${fields}.`, priority: 0 },
    { text: `Use these exact field names. Values must be plain numbers or strings, never nested objects. Use null if missing.`, priority: 2 },
    { text: STRATEGY_CLAUSE[strategy], priority: 1 },
  ] : [
    { text: `Listing page with many ${item}s.`, priority: 3 },
    { text: extra ?? "", priority: 5 },
    { text: `Read ONLY this page. Do not follow links or open individual ${item} pages.`, priority: 4 },
    { text: `Return a flat array: EVERY ${item} on this page as its own top-level JSON object.`, priority: 1 },
    { text: `Fields: ${fields}.`, priority: 0 },
    { text: `Use these exact field names. Values must be plain numbers or strings, never nested objects. Use null if missing.`, priority: 2 },
    { text: STRATEGY_CLAUSE[strategy], priority: 1 },
  ];

  const out = {} as Record<VariantStrategy, string>;
  for (const strategy of Object.keys(STRATEGY_CLAUSE) as VariantStrategy[]) {
    let parts = clauses(strategy).filter((c) => c.text);
    // Shed the least important clause until it fits; never cut one in half.
    while (parts.map((c) => c.text).join(" ").length > MAX_DESCRIPTION && parts.some((c) => c.priority > 0)) {
      const worst = Math.max(...parts.map((c) => c.priority));
      const i = parts.findIndex((c) => c.priority === worst);
      parts = parts.filter((_, j) => j !== i);
    }
    out[strategy] = parts.map((c) => c.text).join(" ").slice(0, MAX_DESCRIPTION).trim();
  }
  return out;
}
