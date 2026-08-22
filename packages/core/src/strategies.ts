import type { VariantStrategy } from "./types.js";

const SCHEMA_CLAUSE =
  "Return one JSON item per product with exactly these fields: " +
  "name (string), price (number, no currency symbol), rating (number), stock (integer). ";

/**
 * Three deliberately different extraction philosophies. Same output schema,
 * different failure modes — that's what makes the Flock outvote a breakage.
 */
export const STRATEGY_PROMPTS: Record<VariantStrategy, string> = {
  css:
    SCHEMA_CLAUSE +
    "Extract every product listed on the page. Use the page's CSS class names and IDs " +
    "as selectors wherever possible.",
  "text-anchor":
    SCHEMA_CLAUSE +
    "Extract every product listed on the page. Do NOT rely on CSS class names or IDs at all — " +
    "they change often on this site. Locate values by visible text labels and patterns instead " +
    "(e.g. the text near 'Rating:', currency amounts like $12.34, phrases like 'In stock' or 'units available').",
  structural:
    SCHEMA_CLAUSE +
    "Extract every product listed on the page. Rely on the DOM structure and element positions " +
    "(e.g. repeated card elements under the main content area, heading followed by value lines), " +
    "not on specific class names.",
};
