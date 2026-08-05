// Quick-sale checkout used to omit cost_source_at_sale from its INSERT, so every
// such line fell back to the table default of 'purchase'. For a product with no
// cost that recorded "cost known, and it is 0", which the reports read as pure
// profit.
//
// This repairs only lines that can only have come from that bug:
//   - recorded as 'purchase'      (what the default wrote)
//   - cost_base_at_sale = 0       (no cost was actually captured)
//   - the product is 'unknown' today (it never had a cost to capture)
// A product deliberately priced at 0 has cost_source 'manual' or 'purchase', so
// it is left alone.
//
//   node database-setup/backfill-cost-source-at-sale.mjs          # dry run
//   node database-setup/backfill-cost-source-at-sale.mjs --apply  # write
import { createClient } from "@libsql/client";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(readFileSync(path.join(root, ".env"), "utf8")
	.split("\n").filter((line) => line.trim() && !line.trim().startsWith("#"))
	.map((line) => [ line.slice(0, line.indexOf("=")).trim(), line.slice(line.indexOf("=") + 1).trim() ]));

const apply = process.argv.includes("--apply");
const db = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN });

const WHERE = `
	oi.cost_source_at_sale = 'purchase'
	AND COALESCE(oi.cost_base_at_sale, 0) = 0
	AND COALESCE(p.cost_source, 'purchase') = 'unknown'`;

const affected = (await db.execute(`
	SELECT s.name store, p.name product, COUNT(*) lines,
		COUNT(DISTINCT o.id) bills, COALESCE(SUM(oi.line_total), 0) revenue
	FROM order_items oi
	JOIN orders o ON o.id = oi.order_id
	JOIN products p ON p.id = oi.product_id
	JOIN stores s ON s.id = o.store_id
	WHERE ${WHERE}
	GROUP BY s.id, p.id ORDER BY revenue DESC`)).rows;

if (!affected.length) {
	console.log("Nothing to repair.");
	process.exit(0);
}

console.log(`${apply ? "APPLYING" : "DRY RUN"} — lines wrongly recorded as costed:\n`);
let totalLines = 0, totalRevenue = 0;
for (const row of affected) {
	totalLines += Number(row.lines);
	totalRevenue += Number(row.revenue);
	console.log(`  ${String(row.store).padEnd(14)} ${String(row.product).padEnd(22)} ${Number(row.lines)} line(s) in ${Number(row.bills)} bill(s)  ${Number(row.revenue).toLocaleString()}`);
}
console.log(`\n  ${totalLines} line(s), ${totalRevenue.toLocaleString()} of revenue currently counted as pure profit`);

if (!apply) {
	console.log("\nNothing was written. Re-run with --apply to repair.");
	process.exit(0);
}

const result = await db.execute(`
	UPDATE order_items SET cost_source_at_sale = 'unknown'
	WHERE id IN (
		SELECT oi.id FROM order_items oi
		JOIN orders o ON o.id = oi.order_id
		JOIN products p ON p.id = oi.product_id
		WHERE ${WHERE}
	)`);
console.log(`\nRepaired ${result.rowsAffected} line(s).`);
process.exit(0);
