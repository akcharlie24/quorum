import { prisma } from "../src/prisma.ts";
async function main() {
  const run = await prisma.run.findFirst({ where: { target: { name: "steam-prices" } }, orderBy: { id: "desc" } });
  const variants = await prisma.variant.findMany({ where: { target: { name: "steam-prices" } } });
  const name = (id: number) => variants.find((v) => v.id === id)?.strategy ?? `#${id}`;
  const votes = await prisma.vote.findMany({ where: { run_id: run!.id } });
  console.log(`run #${run!.id} — ${votes.length} disputed cells\n`);
  for (const v of votes) {
    const dis = JSON.parse(v.dissenting_json ?? "[]") as { variantId: number; value: unknown }[];
    console.log(`  ${v.row_key} · ${v.field}`);
    console.log(`      consensus: ${v.consensus_value}`);
    for (const d of dis) console.log(`      ${name(d.variantId)} said: ${JSON.stringify(d.value)}`);
  }
  await prisma.$disconnect();
}
main();
