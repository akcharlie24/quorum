import { prisma } from "../src/prisma.ts";
async function main() {
  const run = await prisma.run.findFirst({ where: { target: { name: "steam-prices" } }, orderBy: { id: "desc" } });
  const rows = await prisma.variantResult.findMany({ where: { run_id: run!.id } });
  for (const r of rows) {
    const parsed = JSON.parse(r.rows_json ?? "[]");
    const titles = parsed.map((x: any) => x.title);
    console.log(`variant ${r.variant_id}: ${parsed.length} raw rows, ${new Set(titles).size} unique titles`);
    console.log("  titles:", JSON.stringify(titles.slice(0, 14)));
  }
  const t = await prisma.target.findFirst({ where: { name: "steam-prices" } });
  console.log("\nschema.urls count:", JSON.parse(t!.schema_json).urls?.length);
  await prisma.$disconnect();
}
main();
