import { strategyPrompts, MAX_DESCRIPTION } from "../src/strategies.ts";
const fat = {
  keyField: "title",
  fields: { title: "string" as const, price: "number" as const, rating: "number" as const, availability: "string" as const },
  itemLabel: "product listing entry",
  description: "Only items in the main grid, ignore sponsored placements entirely please.",
};
for (const [k, v] of Object.entries(strategyPrompts(fat))) {
  console.log(`--- ${k} (${v.length}/${MAX_DESCRIPTION})\n${v}\n`);
}
