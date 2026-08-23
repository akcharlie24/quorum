/**
 * Prepares the Steam pricing target WITHOUT spending anything.
 *
 * Steam's top-sellers URL made Bright Data's planner build a discovery crawler five
 * times running: ~150 product-page fetches per run, returning {"games": []} every
 * time. Naming the product pages ourselves removes the discovery step entirely —
 * 12 pages per variant instead of 150, and the extraction contract finally matches
 * what the page actually holds.
 */
import { upsertTarget } from "../src/db.ts";
import { prisma } from "../src/prisma.ts";
import { strategyPrompts } from "../src/strategies.ts";
import type { TargetSchema } from "../src/types.ts";

// Age-gated titles (Elden Ring, Baldur's Gate 3, Cyberpunk 2077) redirect to
// /agecheck/ and yield nothing, so they are replaced with ungated equivalents.
const GAMES = [
  ["Total War: WARHAMMER III", "1142710"],
  ["Delta Force", "2507950"],
  ["Forza Horizon 6", "2483190"],
  ["Lords Mobile: Kingdom Wars", "1041320"],
  ["How to Fish", "4001890"],
  ["Counter-Strike 2", "730"],
  ["Dota 2", "570"],
  ["Stardew Valley", "413150"],
  ["Terraria", "105600"],
  ["Hades", "1145360"],
  ["Hollow Knight", "367520"],
  ["Portal 2", "620"],
] as const;

// Steam localises by proxy IP: the same page returned "Delta Force" and
// "三角洲行动" on different fetches. Since title is the key field, a drifting
// locale would stop rows matching at all — so language and currency are pinned.
const LOCALE = "?cc=us&l=english";

const SCHEMA: TargetSchema = {
  keyField: "title",
  fields: { title: "string", price: "number" },
  itemLabel: "game",
  urls: GAMES.map(([, id]) => `https://store.steampowered.com/app/${id}/${LOCALE}`),
};

async function main() {
  const target = await upsertTarget("steam-prices", `https://store.steampowered.com/app/1142710/${LOCALE}`, SCHEMA);
  console.log(`target #${target.id} steam-prices — ${SCHEMA.urls!.length} product pages`);
  for (const [name, id] of GAMES) console.log(`   ${id.padStart(8)}  ${name}`);
  console.log(`\nper-cycle cost: ${SCHEMA.urls!.length} pages x 3 variants = ${SCHEMA.urls!.length * 3} page loads`);
  console.log(`(the old listing target cost ~450 per cycle and returned nothing)\n`);
  console.log("prompt each variant will be built with:");
  for (const [k, v] of Object.entries(strategyPrompts(SCHEMA))) console.log(`  [${k}] ${v.slice(0, 110)}…`);
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
