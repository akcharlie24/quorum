import { strategyPrompts, MAX_DESCRIPTION } from "../src/strategies.ts";
const pdp = {
  keyField: "title",
  fields: { title: "string" as const, price: "number" as const },
  itemLabel: "game",
  urls: ["https://store.steampowered.com/app/1142710/"],
};
for (const [k, v] of Object.entries(strategyPrompts(pdp))) {
  console.log(`--- ${k} (${v.length}/${MAX_DESCRIPTION})\n${v}\n`);
}
