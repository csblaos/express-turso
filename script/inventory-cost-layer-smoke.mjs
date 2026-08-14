// Cost layers have to come down when stock leaves. Before this was wired up,
// every layer stayed open forever, so a FIFO store kept costing sales against
// goods it had already sold.
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directory = await mkdtemp(join(tmpdir(), "cost-layers-"));
process.env.DATABASE_URL = `file:${join(directory, "database.db")}`;
process.env.TURSO_DATABASE_URL = "";

const close = (value) => Math.abs(value) < 0.000001;

try {
	const { DbConn } = await import("../src/connections/DbConn.ts");
	await DbConn.connect();
	const db = DbConn.getClient();
	// Built before the cost module runs: it adds its own columns to
	// inventory_movements, and a table that does not exist yet cannot be altered.
	await db.execute("CREATE TABLE products (id TEXT PRIMARY KEY,store_id TEXT,name TEXT,sku TEXT,barcode TEXT,image_url TEXT,location TEXT,category_id TEXT,base_unit_id TEXT,active INTEGER,inventory_mode TEXT,low_stock_threshold REAL,out_stock_threshold REAL,deleted_at TEXT,created_at TEXT)");
	await db.execute("CREATE TABLE product_categories (id TEXT PRIMARY KEY,store_id TEXT,name TEXT)");
	await db.execute("CREATE TABLE units (id TEXT PRIMARY KEY,name_th TEXT)");
	await db.execute("CREATE TABLE product_units (id TEXT PRIMARY KEY,product_id TEXT,unit_id TEXT,multiplier_to_base REAL,is_base INTEGER,enabled_for_sale INTEGER DEFAULT 0)");
	await db.execute("CREATE TABLE inventory_balances (store_id TEXT,product_id TEXT,on_hand_base REAL,reserved_base REAL,available_base REAL,updated_at TEXT,PRIMARY KEY(store_id,product_id))");
	await db.execute("CREATE TABLE inventory_movements (id TEXT PRIMARY KEY,store_id TEXT,product_id TEXT,type TEXT,qty_base REAL,ref_type TEXT,ref_id TEXT,note TEXT,created_by TEXT,created_at TEXT)");

	const { InventoryCostInterface } = await import("../src/interfaces/InventoryCostInterface.ts");
	await InventoryCostInterface.ensureTables();

	const store = "layer-store";
	const product = "coffee";
	const receipt = (qty, unitCost, at) => InventoryCostInterface.recordReceipt({
		store_id: store, product_id: product, qty_base: qty, unit_cost_base: unitCost,
		source_type: "purchase_order", source_id: `po-${at}`, cost_method: "fifo", received_at: at,
	});

	await receipt(10, 100, "2026-01-01T00:00:00.000Z");
	await receipt(10, 120, "2026-01-02T00:00:00.000Z");

	const afterReceipts = await InventoryCostInterface.getCostSummary(store, product);
	assert.equal(afterReceipts.qty_base_on_hand, 20);
	assert.equal(afterReceipts.average_unit_cost_base, 110, "weighted average of 10@100 and 10@120");
	assert.equal(afterReceipts.fifo_open_qty_base, 20);

	// Twelve out: the whole first receipt at 100, then two from the second at 120.
	const allocations = await InventoryCostInterface.recordIssues(store, [ { product_id: product, qty_base: 12 } ]);
	const allocation = allocations.get(product);
	assert.equal(allocation.qty_from_layers, 12);
	assert.equal(allocation.qty_uncosted, 0);
	assert.equal(allocation.cost_base, 10 * 100 + 2 * 120, "oldest layer first, not the newest");
	assert.ok(close(allocation.unit_cost_base - 1240 / 12));

	const afterIssue = await InventoryCostInterface.getCostSummary(store, product);
	assert.equal(afterIssue.fifo_open_qty_base, 8, "open layers follow the stock that is left");
	assert.equal(afterIssue.qty_base_on_hand, 8, "the summary no longer climbs forever");
	assert.equal(afterIssue.average_unit_cost_base, 110, "an issue never moves the average");
	assert.equal(afterIssue.total_cost_base, 880);
	const openLayers = await InventoryCostInterface.findOpenLayers(store, product);
	assert.equal(openLayers.length, 1, "the exhausted layer closes");
	assert.equal(openLayers[0].unit_cost_base, 120);
	assert.equal(openLayers[0].qty_base_remaining, 8);

	// More than the layers hold: stock counted in by hand never created a layer,
	// so the shortfall is reported rather than costed at zero.
	const short = (await InventoryCostInterface.recordIssues(store, [ { product_id: product, qty_base: 20 } ])).get(product);
	assert.equal(short.qty_from_layers, 8);
	assert.equal(short.qty_uncosted, 12);
	assert.equal(short.cost_base, 8 * 120);
	const drained = await InventoryCostInterface.getCostSummary(store, product);
	assert.equal(drained.fifo_open_qty_base, 0);
	assert.equal(drained.qty_base_on_hand, 0);
	assert.equal(drained.total_cost_base, 0, "no cost left behind on an empty shelf");

	// Two products in one basket, planned in a single pass.
	await InventoryCostInterface.recordReceipt({
		store_id: store, product_id: "tea", qty_base: 5, unit_cost_base: 60,
		source_type: "purchase_order", source_id: "po-tea", received_at: "2026-01-03T00:00:00.000Z",
	});
	await receipt(4, 130, "2026-01-04T00:00:00.000Z");
	const basket = await InventoryCostInterface.recordIssues(store, [
		{ product_id: product, qty_base: 1 },
		{ product_id: "tea", qty_base: 2 },
		{ product_id: product, qty_base: 1 },
	]);
	assert.equal(basket.get(product).qty_base, 2, "the same product twice in one basket is one issue");
	assert.equal(basket.get(product).cost_base, 260);
	assert.equal(basket.get("tea").cost_base, 120);
	assert.equal((await InventoryCostInterface.getCostSummary(store, product)).fifo_open_qty_base, 2);
	assert.equal((await InventoryCostInterface.getCostSummary(store, "tea")).fifo_open_qty_base, 3);

	// A product nobody ever received: no layers, no summary, no crash.
	const missing = await InventoryCostInterface.recordIssues(store, [ { product_id: "ghost", qty_base: 3 } ]);
	assert.equal(missing.get("ghost").qty_uncosted, 3);
	assert.equal(missing.get("ghost").cost_base, 0);

	// A write-off is not a sale, but it takes the same real goods off the shelf.
	await db.execute("INSERT INTO products(id,store_id,name,sku,base_unit_id,active,inventory_mode) VALUES('sugar','layer-store','Sugar','SUGAR','unit',1,'tracked')");
	await db.execute("INSERT INTO inventory_balances VALUES('layer-store','sugar',6,0,6,'2026-01-05T00:00:00.000Z')");
	await InventoryCostInterface.recordReceipt({
		store_id: store, product_id: "sugar", qty_base: 6, unit_cost_base: 50,
		source_type: "purchase_order", source_id: "po-sugar", received_at: "2026-01-05T00:00:00.000Z",
	});
	const { InventoryInterface } = await import("../src/interfaces/InventoryInterface.ts");
	// Reducing stock by hand has to say why: the reason is what the movement is
	// audited on, and the interface refuses the write-off without one.
	await InventoryInterface.adjustStock({ store_id: store, product_id: "sugar", mode: "decrement", qty_base: 2, adjustment_reason: "spoiled", note: "spoiled", created_by: "staff" });
	const afterWriteOff = await InventoryCostInterface.getCostSummary(store, "sugar");
	assert.equal(afterWriteOff.fifo_open_qty_base, 4, "a write-off draws the layers down");
	assert.equal(afterWriteOff.qty_base_on_hand, 4);
	// Counting stock in by hand says nothing about what it cost, so it must not
	// invent a layer - the shortfall shows up as uncosted quantity instead.
	await InventoryInterface.adjustStock({ store_id: store, product_id: "sugar", mode: "increment", qty_base: 3, created_by: "staff" });
	assert.equal((await InventoryCostInterface.getCostSummary(store, "sugar")).fifo_open_qty_base, 4, "stock added by hand creates no layer");

	// The other half of the story: a store on the average method. Receiving after
	// stock has already gone out has to re-blend against what is left, not against
	// everything that was ever received.
	const averaged = "flour";
	const averageReceipt = (qty, unitCost, at) => InventoryCostInterface.recordReceipt({
		store_id: store, product_id: averaged, qty_base: qty, unit_cost_base: unitCost,
		source_type: "purchase_order", source_id: `po-${averaged}-${at}`, cost_method: "average", received_at: at,
	});
	await averageReceipt(10, 90, "2026-02-01T00:00:00.000Z");
	assert.equal((await InventoryCostInterface.getCostSummary(store, averaged)).average_unit_cost_base, 90);
	await InventoryCostInterface.recordIssues(store, [ { product_id: averaged, qty_base: 6 } ]);
	const midway = await InventoryCostInterface.getCostSummary(store, averaged);
	assert.equal(midway.qty_base_on_hand, 4);
	assert.equal(midway.average_unit_cost_base, 90, "selling at the average leaves the average alone");
	assert.equal(midway.total_cost_base, 360, "and the total follows the quantity that is left");
	await averageReceipt(6, 160, "2026-02-02T00:00:00.000Z");
	const reblended = await InventoryCostInterface.getCostSummary(store, averaged);
	assert.equal(reblended.qty_base_on_hand, 10);
	assert.equal(reblended.total_cost_base, 4 * 90 + 6 * 160);
	assert.equal(reblended.average_unit_cost_base, 132, "(4 x 90 + 6 x 160) / 10, not a blend of all 16 ever received");
	// Before layers were consumed this read 10 received at 90 plus 6 at 160, which
	// is the bug that made the average drift low for good.
	assert.notEqual(reblended.average_unit_cost_base, (10 * 90 + 6 * 160) / 16);

	// The freight bill arrives after the goods. Re-pricing the receipt has to move
	// the layer and the average, but only for what is still on the shelf.
	const late = "olives";
	await InventoryCostInterface.recordReceipt({
		store_id: store, product_id: late, qty_base: 100, unit_cost_base: 10,
		source_type: "purchase_order", source_id: "po-late", source_line_id: "line-late", received_at: "2026-03-01T00:00:00.000Z",
	});
	await InventoryCostInterface.recordIssues(store, [ { product_id: late, qty_base: 20 } ]);
	// 1,000 of freight over the 100 units the order covered is 10 more per unit.
	const reprice = await InventoryCostInterface.repriceReceipt({
		store_id: store, product_id: late, source_type: "purchase_order",
		source_id: "po-late", source_line_id: "line-late", delta_per_base_unit: 10,
	});
	assert.equal(reprice.revalued_qty, 80, "only the 80 still on hand are revalued");
	assert.equal(reprice.revalued_cost, 800, "the 20 already sold keep the cost they were sold at");
	await db.batch(reprice.statements, "write");
	const repriced = await InventoryCostInterface.getCostSummary(store, late);
	assert.equal(repriced.average_unit_cost_base, 20, "10 of goods plus 10 of freight");
	assert.equal(repriced.total_cost_base, 1600);
	assert.equal((await InventoryCostInterface.findOpenLayers(store, late))[0].unit_cost_base, 20, "and the layer itself carries the new cost forward");
	// Nothing to spread means nothing to write.
	assert.equal((await InventoryCostInterface.repriceReceipt({ store_id: store, product_id: late, source_type: "purchase_order", source_id: "po-late", delta_per_base_unit: 0 })).statements.length, 0);

	// The blend a sale is costed at: what the layers covered, plus the product's
	// own cost for the quantity they could not.
	assert.equal(InventoryCostInterface.issueUnitCost({ qty_base: 4, qty_from_layers: 4, qty_uncosted: 0, cost_base: 440 }, 999), 110);
	assert.equal(InventoryCostInterface.issueUnitCost({ qty_base: 4, qty_from_layers: 2, qty_uncosted: 2, cost_base: 200 }, 150), 125);
	assert.equal(InventoryCostInterface.issueUnitCost({ qty_base: 4, qty_from_layers: 0, qty_uncosted: 4, cost_base: 0 }, 150), 150, "no layers at all falls back whole");
	assert.equal(InventoryCostInterface.issueUnitCost(undefined, 150), 150, "an untracked product keeps its own cost");

	console.log("Inventory cost layer smoke passed: receipts, FIFO issue order, average held, shortfalls, and baskets");
	db.close();
} finally {
	await rm(directory, { recursive: true, force: true });
}
