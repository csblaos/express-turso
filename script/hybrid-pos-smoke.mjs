import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tempDirectory = await mkdtemp(join(tmpdir(), "hybrid-pos-smoke-"));
process.env.DATABASE_URL = `file:${join(tempDirectory, "database.db")}`;
process.env.TURSO_DATABASE_URL = "";

try {
	const { DbConn } = await import("../src/connections/DbConn.ts");
	await DbConn.connect();
	const db = DbConn.getClient();
	for (const sql of [
		`CREATE TABLE products (id TEXT PRIMARY KEY,store_id TEXT NOT NULL,name TEXT NOT NULL,sku TEXT NOT NULL,barcode TEXT,category_id TEXT,base_unit_id TEXT NOT NULL,price_base REAL NOT NULL,cost_base REAL NOT NULL,active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL)`,
		`CREATE TABLE product_units (id TEXT PRIMARY KEY,product_id TEXT NOT NULL,unit_id TEXT NOT NULL,enabled_for_sale INTEGER NOT NULL DEFAULT 1)`,
		`CREATE TABLE product_categories (id TEXT PRIMARY KEY,store_id TEXT NOT NULL,name TEXT NOT NULL,sort_order INTEGER)`,
		`CREATE TABLE orders (id TEXT PRIMARY KEY,store_id TEXT NOT NULL,order_no TEXT NOT NULL,channel TEXT,status TEXT,subtotal REAL,discount REAL,vat_amount REAL,shipping_fee_charged REAL,total REAL,shipping_cost REAL,created_by TEXT,created_at TEXT,payment_currency TEXT,payment_method TEXT,payment_account_id TEXT,payment_slip_url TEXT,payment_proof_submitted_at TEXT,payment_status TEXT,paid_at TEXT)`,
		`CREATE TABLE order_items (id TEXT PRIMARY KEY,order_id TEXT NOT NULL,product_id TEXT NOT NULL,unit_id TEXT NOT NULL,qty REAL NOT NULL,qty_base REAL NOT NULL,price_base_at_sale REAL NOT NULL,cost_base_at_sale REAL NOT NULL,line_total REAL NOT NULL)`,
		`CREATE TABLE inventory_balances (store_id TEXT NOT NULL,product_id TEXT NOT NULL,on_hand_base REAL NOT NULL,reserved_base REAL NOT NULL,available_base REAL NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(store_id,product_id))`,
		`CREATE TABLE inventory_movements (id TEXT PRIMARY KEY,store_id TEXT NOT NULL,product_id TEXT NOT NULL,type TEXT NOT NULL,qty_base REAL NOT NULL,ref_type TEXT,ref_id TEXT,note TEXT,created_by TEXT,created_at TEXT NOT NULL)`,
		`CREATE TABLE cash_flow_entries (id TEXT PRIMARY KEY,store_id TEXT NOT NULL,account_id TEXT,direction TEXT,entry_type TEXT,source_type TEXT,source_id TEXT,amount REAL,currency TEXT,reference TEXT,note TEXT,metadata TEXT,occurred_at TEXT,created_by TEXT,created_at TEXT)`,
		`CREATE TABLE idempotency_requests (id TEXT PRIMARY KEY,store_id TEXT NOT NULL,action TEXT NOT NULL,idempotency_key TEXT NOT NULL,request_hash TEXT,status TEXT,response_status INTEGER,response_body TEXT,created_by TEXT,created_at TEXT,completed_at TEXT)`,
	]) await db.execute(sql);

	const stamp = new Date().toISOString();
	await db.execute({ sql: "INSERT INTO stores(id,name,store_type,currency,created_at) VALUES(?,?,?,?,?)", args: [ "smoke-store", "Hybrid Smoke", "RESTAURANT", "LAK", stamp ] });
	await db.execute({ sql: "INSERT INTO products(id,store_id,name,sku,base_unit_id,price_base,cost_base,active,created_at) VALUES(?,?,?,?,?,?,?,?,?)", args: [ "beer", "smoke-store", "Beer", "BEER", "bottle", 100, 60, 1, stamp ] });
	await db.execute({ sql: "INSERT INTO products(id,store_id,name,sku,base_unit_id,price_base,cost_base,active,created_at) VALUES(?,?,?,?,?,?,?,?,?)", args: [ "pizza", "smoke-store", "Pizza", "PIZZA", "plate", 200, 0, 1, stamp ] });
	await db.execute("ALTER TABLE products ADD COLUMN inventory_mode TEXT NOT NULL DEFAULT 'tracked'");
	await db.execute("ALTER TABLE products ADD COLUMN cost_source TEXT NOT NULL DEFAULT 'purchase'");
	await db.execute("ALTER TABLE products ADD COLUMN manual_sold_out INTEGER NOT NULL DEFAULT 0");
	await db.execute("ALTER TABLE products ADD COLUMN updated_at TEXT");
	await db.execute("ALTER TABLE products ADD COLUMN deleted_at TEXT");
	await db.execute("ALTER TABLE products ADD COLUMN location TEXT");
	await db.execute("ALTER TABLE products ADD COLUMN low_stock_threshold REAL");
	await db.execute("UPDATE products SET inventory_mode='untracked',cost_source='unknown' WHERE id='pizza'");
	await db.execute({ sql: "INSERT INTO inventory_balances(store_id,product_id,on_hand_base,reserved_base,available_base,updated_at) VALUES(?,?,?,?,?,?)", args: [ "smoke-store", "beer", 5, 0, 5, stamp ] });

	const { RestaurantInterface } = await import("../src/interfaces/RestaurantInterface.ts");
	await RestaurantInterface.ensureTables();
	await db.execute("UPDATE stores SET pickup_queue_enabled=1 WHERE id='smoke-store'");
	const first = await RestaurantInterface.createOrder("smoke-store", { service_mode: "pickup", idempotency_key: "open-1", initial_item: { product_id: "beer", qty: 1 } }, "cashier");
	assert.equal(first.queue_no, "Q001");
	const firstRetry = await RestaurantInterface.createOrder("smoke-store", { service_mode: "pickup", idempotency_key: "open-1", initial_item: { product_id: "beer", qty: 1 } }, "cashier");
	assert.equal(firstRetry.id, first.id);
	const paid = await RestaurantInterface.checkout("smoke-store", first.id, { expected_version: first.version, payment_method: "cash", amount_tendered: 100, dispatch_mode: "direct" }, "cashier", "checkout-1");
	assert.equal(paid.status, "completed");
	assert.equal(paid.rounds[0].dispatch_mode, "direct");
	const balance = await db.execute("SELECT on_hand_base FROM inventory_balances WHERE store_id='smoke-store' AND product_id='beer'");
	assert.equal(Number(balance.rows[0].on_hand_base), 4);
	await RestaurantInterface.checkout("smoke-store", first.id, { expected_version: first.version, payment_method: "cash", amount_tendered: 100, dispatch_mode: "direct" }, "cashier", "checkout-1");
	const movements = await db.execute("SELECT COUNT(*) AS total FROM inventory_movements WHERE product_id='beer'");
	assert.equal(Number(movements.rows[0].total), 1);

	const second = await RestaurantInterface.createOrder("smoke-store", { service_mode: "pickup", idempotency_key: "open-2", initial_item: { product_id: "pizza", qty: 1 } }, "cashier");
	assert.equal(second.queue_no, "Q002");
	const secondWithExtra = await RestaurantInterface.addItem("smoke-store", second.id, { product_id: "pizza", qty: 1, expected_version: second.version }, "cashier");
	assert.equal(secondWithExtra.items.length, 2);
	const zone = await RestaurantInterface.saveZone("smoke-store", { name: "Zone A", sort_order: 1 });
	const table = await RestaurantInterface.saveTable("smoke-store", { zone_id: zone.id, name: "A1", capacity: 2 });
	const dineIn = await RestaurantInterface.changeServiceMode("smoke-store", secondWithExtra.id, { service_mode: "dine-in", table_id: table.id, guest_count: 2, expected_version: secondWithExtra.version }, "cashier");
	assert.equal(dineIn.service_mode, "dine-in");
	assert.equal(dineIn.items.length, 2);
	const sent = await RestaurantInterface.sendRound("smoke-store", dineIn.id, dineIn.version, "send-2", "cashier", [
		{ product_id: "beer", qty: 1 },
		{ product_id: "beer", qty: 1 },
	]);
	assert.equal(sent.rounds[0].dispatch_mode, "kitchen");
	assert.equal(sent.items.filter((item) => item.product_id === "beer").length, 1, "batch send merges duplicate local draft products");
	assert.equal(sent.items.find((item) => item.product_id === "beer")?.qty, 2);
	const sentRetry = await RestaurantInterface.sendRound("smoke-store", dineIn.id, dineIn.version, "send-2", "cashier", [{ product_id: "beer", qty: 2 }]);
	assert.equal(sentRetry.rounds.length, 1, "batch send idempotency does not create another kitchen round");
	const batchBeerMovements = await db.execute({
		sql: "SELECT COUNT(*) AS total FROM inventory_movements WHERE product_id='beer' AND ref_type='restaurant_round' AND ref_id=?",
		args: [sent.rounds[0].id],
	});
	assert.equal(Number(batchBeerMovements.rows[0].total), 1, "batch send writes one merged stock movement");
	const completed = await RestaurantInterface.checkout("smoke-store", sent.id, { expected_version: sent.version, payment_method: "cash", amount_tendered: 600, dispatch_mode: "existing" }, "cashier", "checkout-2");
	assert.equal(completed.status, "completed");
	assert.equal((await RestaurantInterface.listOpenOrders("smoke-store")).length, 0);
	const pizzaMovements = await db.execute("SELECT COUNT(*) AS total FROM inventory_movements WHERE product_id='pizza'");
	assert.equal(Number(pizzaMovements.rows[0].total), 0);

	const { OrderInterface } = await import("../src/interfaces/OrderInterface.ts");
	const quick = await OrderInterface.checkout({
		store_id: "smoke-store", service_mode: "pickup", payment_method: "cash",
		items: [{ product_id: "beer", qty: 1 }], amount_tendered: 100,
		idempotency_key: "quick-checkout-1", created_by: "cashier",
	});
	assert.equal(quick.queue_no, "Q003");
	assert.equal(quick.receipt.lines[0].name, "Beer");
	assert.equal(quick.receipt.lines[0].line_total, 100);
	const quickRetry = await OrderInterface.checkout({
		store_id: "smoke-store", service_mode: "pickup", payment_method: "cash",
		items: [{ product_id: "beer", qty: 1 }], amount_tendered: 100,
		idempotency_key: "quick-checkout-1", created_by: "cashier",
	});
	assert.equal(quickRetry.queue_no, quick.queue_no);
	const quickMovements = await db.execute({ sql: "SELECT COUNT(*) AS total FROM inventory_movements WHERE product_id=? AND ref_id=?", args: [ "beer", quick.order_id ] });
	assert.equal(Number(quickMovements.rows[0].total), 1);
	const nextQuick = await OrderInterface.checkout({
		store_id: "smoke-store", service_mode: "pickup", payment_method: "cash",
		items: [{ product_id: "beer", qty: 1 }], amount_tendered: 100, idempotency_key: "quick-checkout-2", created_by: "cashier",
	});
	assert.equal(nextQuick.queue_no, "Q004");
	assert.equal((await RestaurantInterface.listOpenOrders("smoke-store")).length, 0);

	const { NotificationInterface } = await import("../src/interfaces/NotificationInterface.ts");
	await NotificationInterface.reconcile("smoke-store", [ "stock" ]);
	const notifications = await NotificationInterface.list("smoke-store", "cashier", { topic: "stock" });
	assert.equal(notifications.items.some((item) => item.entity_id === "beer" && item.due_status === "out_of_stock"), true, "stock notification is created from the committed balance");

	const { ReportInterface } = await import("../src/interfaces/ReportInterface.ts");
	const report = await ReportInterface.dashboard("smoke-store", { preset: "today", timezoneOffset: 420 });
	const expectedReport = await db.execute("SELECT COUNT(*) AS bill_count,COALESCE(SUM(total),0) AS revenue FROM orders WHERE store_id='smoke-store' AND status='completed' AND payment_status='paid'");
	assert.equal(report.summary.bill_count, Number(expectedReport.rows[0].bill_count), "report counts only completed paid bills");
	assert.equal(report.summary.revenue, Number(expectedReport.rows[0].revenue), "report revenue reconciles with paid orders");
	assert.equal(report.payment_mix[0].method, "cash");
	assert.equal(report.top_products.some((item) => item.id === "beer"), true);
	assert.equal(report.period.from.endsWith("17:00:00.000Z"), true, "UTC+7 day starts at 17:00Z");
	const weekReport = await ReportInterface.dashboard("smoke-store", { preset: "7d", timezoneOffset: 420 });
	assert.equal(weekReport.summary.revenue, report.summary.revenue);

	console.log("Hybrid POS smoke passed: orders, receipt, idempotency, stock-once, cleanup, and real report reconciliation");
	db.close();
} finally {
	await rm(tempDirectory, { recursive: true, force: true });
}
