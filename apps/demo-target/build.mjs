// Builds public/index.html from products.json using the layout named in layout.config.json.
// Layouts simulate real-world site changes:
//   v1 = clean semantic markup
//   v2 = redesign: renamed classes, restructured DOM, split price markup
//   v3 = silent corruption: markup identical to v1, but data is garbage
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const products = JSON.parse(readFileSync(join(root, "products.json"), "utf8"));
const { active } = JSON.parse(readFileSync(join(root, "layout.config.json"), "utf8"));

const page = (body, note) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>WebHead Gear — Friendly Neighborhood Store</title>
<style>
  :root { --red: #b11313; --blue: #1a3c8f; --ink: #16181d; }
  * { box-sizing: border-box; margin: 0; }
  body { font-family: "Avenir Next", "Segoe UI", sans-serif; background: #f4f5f7; color: var(--ink); }
  header { background: linear-gradient(120deg, var(--red), var(--blue)); color: #fff; padding: 28px 24px; }
  header h1 { font-size: 1.6rem; letter-spacing: 0.5px; }
  header p { opacity: 0.85; font-size: 0.9rem; margin-top: 4px; }
  main { max-width: 960px; margin: 24px auto; padding: 0 16px; display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 16px; }
  .card-shell { background: #fff; border-radius: 10px; padding: 16px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
  footer { text-align: center; font-size: 0.75rem; color: #888; padding: 24px; }
</style>
</head>
<body>
<header>
  <h1>🕸️ WebHead Gear</h1>
  <p>Your friendly neighborhood equipment store${note ? " — " + note : ""}</p>
</header>
<main>
${body}
</main>
<footer>SILK demo target · layout ${active}</footer>
</body>
</html>
`;

const money = (n) => n.toFixed(2);
const stars = (r) => r.toFixed(1);

const layouts = {
  // v1: clean semantic markup — what a well-built store looks like.
  v1: () =>
    page(
      products
        .map(
          (p) => `  <article class="card-shell product-card">
    <h3 class="product-name">${p.name}</h3>
    <p class="product-price">$${money(p.price)}</p>
    <p class="product-rating">Rating: ${stars(p.rating)} / 5</p>
    <p class="product-stock">In stock: ${p.stock}</p>
  </article>`
        )
        .join("\n")
    ),

  // v2: the "redesign" — classes renamed to hashed tokens, extra wrapper divs,
  // price split across nested spans, rating moved into a data attribute + badge,
  // stock phrased differently. Text anchors survive; CSS selectors do not.
  v2: () =>
    page(
      products
        .map(
          (p) => `  <div class="card-shell x-t7k">
    <div class="x-hd9">
      <span class="x-nm2">${p.name}</span>
    </div>
    <div class="x-bd4">
      <div class="x-pr8"><span class="x-cur">$</span><span class="x-amt">${money(p.price)}</span></div>
      <div class="x-rt1" data-score="${stars(p.rating)}">★ ${stars(p.rating)}</div>
      <div class="x-st6">${p.stock} units available</div>
    </div>
  </div>`
        )
        .join("\n"),
      "new look, same gear!"
    ),

  // v3: silent corruption — DOM identical to v1, data garbage (prices zeroed,
  // stock frozen). Scrapers keep "working"; only drift detection catches this.
  v3: () =>
    page(
      products
        .map(
          (p) => `  <article class="card-shell product-card">
    <h3 class="product-name">${p.name}</h3>
    <p class="product-price">$0.00</p>
    <p class="product-rating">Rating: ${stars(p.rating)} / 5</p>
    <p class="product-stock">In stock: 999</p>
  </article>`
        )
        .join("\n")
    ),
};

if (!layouts[active]) {
  console.error(`Unknown layout "${active}". Valid: ${Object.keys(layouts).join(", ")}`);
  process.exit(1);
}

mkdirSync(join(root, "public"), { recursive: true });
writeFileSync(join(root, "public", "index.html"), layouts[active]());
console.log(`Built layout ${active} -> apps/demo-target/public/index.html`);
