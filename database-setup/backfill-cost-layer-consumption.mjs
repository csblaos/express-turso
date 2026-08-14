// Cost layers were written when goods were received but never drawn down when
// they were sold, so every layer still reads as fully in stock. A FIFO store was
// therefore costing against layers that were sold long ago, and
// inventory_cost_summaries.qty_base_on_hand only ever climbed.
//
// The sale, round-dispatch, and adjustment paths now consume layers as stock
// leaves. This repairs what those paths already missed, by making the layers
// agree with the balance that is actually on the shelf:
//   - consume the oldest layers until the open quantity equals on_hand_base
//   - rewrite the summary quantity and total to match, at the same average
//
// A product whose open layers are already short of its balance is left alone:
// the extra stock came in through a manual adjustment, which never said what it
// cost, and inventing a layer would invent a cost.
//
//   node database-setup/backfill-cost-layer-consumption.mjs          # dry run
//   node database-setup/backfill-cost-layer-consumption.mjs --apply  # write
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
const now = new Date().toISOString();

const products = (await db.execute(`
	SELECT
		l.store_id,
		l.product_id,
		COALESCE(s.name, l.store_id) store_name,
		COALESCE(p.name, l.product_id) product_name,
		SUM(l.qty_base_remaining) open_qty,
		SUM(l.qty_base_remaining * l.unit_cost_base) open_cost,
		COALESCE(MAX(b.on_hand_base), 0) on_hand
	FROM inventory_cost_layers l
	LEFT JOIN inventory_balances b ON b.store_id = l.store_id AND b.product_id = l.product_id
	LEFT JOIN products p ON p.id = l.product_id
	LEFT JOIN stores s ON s.id = l.store_id
	WHERE l.qty_base_remaining > 0
	GROUP BY l.store_id, l.product_id
	HAVING SUM(l.qty_base_remaining) > COALESCE(MAX(b.on_hand_base), 0) + 0.000001
	ORDER BY (SUM(l.qty_base_remaining) - COALESCE(MAX(b.on_hand_base), 0)) DESC`)).rows;

if (!products.length) {
	console.log("Every product's open layers already match its balance. Nothing to repair.");
	process.exit(0);
}

console.log(`${apply ? "APPLYING" : "DRY RUN"} — layers still counting stock that has left:\n`);
let totalQty = 0;
let totalCost = 0;
for (const row of products) {
	const excess = Number(row.open_qty) - Number(row.on_hand);
	totalQty += excess;
	console.log(`  ${String(row.store_name).padEnd(14)} ${String(row.product_name).padEnd(24)} open ${Number(row.open_qty).toLocaleString().padStart(9)}  on hand ${Number(row.on_hand).toLocaleString().padStart(9)}  overstated by ${excess.toLocaleString()}`);
}
console.log(`\n  ${products.length} product(s), ${totalQty.toLocaleString()} unit(s) of stock counted twice`);

if (!apply) {
	console.log("\nNothing was written. Re-run with --apply to repair.");
	process.exit(0);
}

let layersTouched = 0;
for (const row of products) {
	const storeId = String(row.store_id);
	const productId = String(row.product_id);
	const target = Math.max(0, Number(row.on_hand));
	let excess = Number(row.open_qty) - target;

	const layers = (await db.execute({
		sql: `SELECT id, qty_base_remaining, unit_cost_base FROM inventory_cost_layers
			WHERE store_id = ? AND product_id = ? AND qty_base_remaining > 0
			ORDER BY created_at ASC, id ASC`,
		args: [ storeId, productId ],
	})).rows;

	const statements = [];
	for (const layer of layers) {
		if (excess <= 0.000001) break;
		const remaining = Number(layer.qty_base_remaining);
		const taken = Math.min(remaining, excess);
		excess -= taken;
		totalCost += taken * Number(layer.unit_cost_base);
		layersTouched += 1;
		statements.push({
			sql: "UPDATE inventory_cost_layers SET qty_base_remaining = MAX(qty_base_remaining - ?, 0), updated_at = ? WHERE id = ?",
			args: [ taken, now, String(layer.id) ],
		});
	}

	// The average is what the shop paid on receipts and must not move; only the
	// quantity it applies to changes.
	statements.push({
		sql: `UPDATE inventory_cost_summaries SET
			qty_base_on_hand = ?,
			total_cost_base = average_unit_cost_base * ?,
			updated_at = ?
			WHERE store_id = ? AND product_id = ?`,
		args: [ target, target, now, storeId, productId ],
	});

	await db.batch(statements, "write");
}

console.log(`\nRepaired ${products.length} product(s) across ${layersTouched} layer(s); ${Math.round(totalCost).toLocaleString()} of cost released.`);
process.exit(0);
