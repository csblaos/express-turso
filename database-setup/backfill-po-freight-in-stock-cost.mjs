// Shipping and other costs are spread over the goods at the moment a purchase
// order is received. If the freight bill only turned up later - which is the
// normal case, and what settling a payment records - the receipt had nothing to
// spread, so the stock was left valued at the bare goods price.
//
// Settling now re-prices the receipt, but orders settled before that fix still
// carry the gap. This finds them by comparing what each received line should
// have cost, freight included, against what its cost layer actually says, and
// corrects the layers, the running average, and the product cost.
//
// Only stock still on hand is revalued. Anything already sold keeps the cost it
// was sold at: restating a bill after the fact would move a profit figure the
// shop has already read.
//
//   node database-setup/backfill-po-freight-in-stock-cost.mjs          # dry run
//   node database-setup/backfill-po-freight-in-stock-cost.mjs --apply  # write
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
const money = (value) => Math.round(Number(value || 0)).toLocaleString();

const orders = (await db.execute(`
	SELECT po.id, po.store_id, po.po_number, po.shipping_cost, po.other_cost,
		COALESCE(s.name, po.store_id) store_name,
		(SELECT SUM(i.qty_base_ordered) FROM purchase_order_items i WHERE i.purchase_order_id = po.id) ordered_qty
	FROM purchase_orders po
	LEFT JOIN stores s ON s.id = po.store_id
	WHERE po.received_at IS NOT NULL AND (COALESCE(po.shipping_cost,0) + COALESCE(po.other_cost,0)) > 0
	ORDER BY po.received_at`)).rows;

const corrections = [];
for (const order of orders) {
	const orderedQty = Number(order.ordered_qty || 0);
	if (orderedQty <= 0) continue;
	const expectedExtraPerUnit = (Number(order.shipping_cost || 0) + Number(order.other_cost || 0)) / orderedQty;

	const lines = (await db.execute({
		sql: `SELECT i.id line_id, i.product_id, i.unit_cost_base, i.landed_cost_per_unit, i.qty_base_received,
				p.name product_name,
				l.id layer_id, l.unit_cost_base layer_unit_cost, l.qty_base_remaining
			FROM purchase_order_items i
			JOIN products p ON p.id = i.product_id
			JOIN inventory_cost_layers l ON l.source_id = i.purchase_order_id AND l.source_line_id = i.id
			WHERE i.purchase_order_id = ? AND i.qty_base_received > 0`,
		args: [ String(order.id) ],
	})).rows;

	for (const line of lines) {
		const goodsUnitCost = Number(line.landed_cost_per_unit || line.unit_cost_base || 0);
		const expectedUnitCost = goodsUnitCost + expectedExtraPerUnit;
		const actualUnitCost = Number(line.layer_unit_cost || 0);
		const delta = expectedUnitCost - actualUnitCost;
		if (Math.abs(delta) < 0.000001) continue;
		corrections.push({
			store_id: String(order.store_id),
			store_name: String(order.store_name),
			po_number: String(order.po_number),
			product_id: String(line.product_id),
			product_name: String(line.product_name),
			layer_id: String(line.layer_id),
			remaining: Number(line.qty_base_remaining || 0),
			actualUnitCost,
			expectedUnitCost,
			delta,
		});
	}
}

if (!corrections.length) {
	console.log("Every received line already carries its share of the freight. Nothing to repair.");
	process.exit(0);
}

console.log(`${apply ? "APPLYING" : "DRY RUN"} — received stock priced without its freight:\n`);
let totalRevalued = 0;
for (const item of corrections) {
	const revalued = item.remaining * item.delta;
	totalRevalued += revalued;
	console.log(`  ${item.po_number.padEnd(20)} ${item.product_name.slice(0, 18).padEnd(18)} ${money(item.actualUnitCost).padStart(8)} -> ${money(item.expectedUnitCost).padStart(8)} per unit   ${String(item.remaining).padStart(5)} on hand   stock value ${revalued >= 0 ? "+" : ""}${money(revalued)}`);
}
console.log(`\n  ${corrections.length} line(s); stock value understated by ${money(totalRevalued)}`);

if (!apply) {
	console.log("\nNothing was written. Re-run with --apply to repair.");
	process.exit(0);
}

for (const item of corrections) {
	await db.execute({
		sql: "UPDATE inventory_cost_layers SET unit_cost_base = ?, total_cost_base = qty_base_in * ?, updated_at = ? WHERE id = ?",
		args: [ item.expectedUnitCost, item.expectedUnitCost, now, item.layer_id ],
	});
}

// Rebuild the average from the corrected layers rather than nudging it by the
// difference. Patching it incrementally leaves behind whatever the units already
// sold were charged at, which is a few thousand out; recomputing lands exactly on
// what is on the shelf. Only safe where the layers cover the whole balance -
// stock counted in by hand has no layer, so its share keeps the old average.
const touched = new Map(corrections.map((item) => [ `${item.store_id}:${item.product_id}`, item ]));
let rebuilt = 0;
let patched = 0;
for (const item of touched.values()) {
	const state = (await db.execute({
		sql: `SELECT
				(SELECT COALESCE(SUM(qty_base_remaining), 0) FROM inventory_cost_layers WHERE store_id = ? AND product_id = ?) layer_qty,
				(SELECT COALESCE(SUM(qty_base_remaining * unit_cost_base), 0) FROM inventory_cost_layers WHERE store_id = ? AND product_id = ?) layer_cost,
				(SELECT COALESCE(on_hand_base, 0) FROM inventory_balances WHERE store_id = ? AND product_id = ?) on_hand`,
		args: [ item.store_id, item.product_id, item.store_id, item.product_id, item.store_id, item.product_id ],
	})).rows[0];

	const layerQty = Number(state.layer_qty || 0);
	const layerCost = Number(state.layer_cost || 0);
	const onHand = Number(state.on_hand || 0);

	if (Math.abs(layerQty - onHand) < 0.000001 && onHand > 0) {
		await db.execute({
			sql: `UPDATE inventory_cost_summaries SET qty_base_on_hand = ?, total_cost_base = ?, average_unit_cost_base = ?, updated_at = ?
				WHERE store_id = ? AND product_id = ?`,
			args: [ onHand, layerCost, layerCost / onHand, now, item.store_id, item.product_id ],
		});
		rebuilt += 1;
	} else {
		const revalued = item.remaining * item.delta;
		await db.execute({
			sql: `UPDATE inventory_cost_summaries SET
				total_cost_base = MAX(total_cost_base + ?, 0),
				average_unit_cost_base = CASE WHEN qty_base_on_hand > 0 THEN MAX(total_cost_base + ?, 0) / qty_base_on_hand ELSE 0 END,
				updated_at = ?
				WHERE store_id = ? AND product_id = ?`,
			args: [ revalued, revalued, now, item.store_id, item.product_id ],
		});
		patched += 1;
	}

	await db.execute({
		sql: `UPDATE products SET cost_base = (
				SELECT average_unit_cost_base FROM inventory_cost_summaries
				WHERE store_id = products.store_id AND product_id = products.id
			), updated_at = ?
			WHERE id = ? AND store_id = ? AND COALESCE(cost_source, 'purchase') != 'manual'
				AND EXISTS (SELECT 1 FROM inventory_cost_summaries WHERE store_id = products.store_id AND product_id = products.id AND qty_base_on_hand > 0)`,
		args: [ now, item.product_id, item.store_id ],
	});
}

console.log(`\nRepaired ${corrections.length} line(s) across ${touched.size} product(s) - ${rebuilt} rebuilt from layers, ${patched} adjusted by difference.`);
process.exit(0);
