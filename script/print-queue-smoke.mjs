import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tempDirectory = await mkdtemp(join(tmpdir(), "print-queue-smoke-"));
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
	await db.execute({ sql: "INSERT INTO stores(id,name,store_type,currency,created_at) VALUES(?,?,?,?,?)", args: [ "print-store", "Print Smoke", "RESTAURANT", "LAK", stamp ] });
	for (const [ id, name, categoryId ] of [ [ "larb", "Larb", "cat-hot" ], [ "beer", "Beer", "cat-bar" ], [ "rice", "Rice", null ] ]) {
		await db.execute({ sql: "INSERT INTO products(id,store_id,name,sku,category_id,base_unit_id,price_base,cost_base,active,created_at) VALUES(?,?,?,?,?,?,?,?,1,?)", args: [ id, "print-store", name, id.toUpperCase(), categoryId, "plate", 100, 0, stamp ] });
	}
	await db.execute("ALTER TABLE products ADD COLUMN inventory_mode TEXT NOT NULL DEFAULT 'untracked'");
	await db.execute("ALTER TABLE products ADD COLUMN cost_source TEXT NOT NULL DEFAULT 'unknown'");
	await db.execute("ALTER TABLE products ADD COLUMN manual_sold_out INTEGER NOT NULL DEFAULT 0");
	await db.execute("ALTER TABLE products ADD COLUMN updated_at TEXT");
	await db.execute("ALTER TABLE products ADD COLUMN deleted_at TEXT");
	await db.execute("ALTER TABLE products ADD COLUMN location TEXT");
	await db.execute("ALTER TABLE products ADD COLUMN low_stock_threshold REAL");
	for (const [ id, name ] of [ [ "cat-hot", "Hot kitchen" ], [ "cat-bar", "Drinks" ] ]) {
		await db.execute({ sql: "INSERT INTO product_categories(id,store_id,name,sort_order) VALUES(?,?,?,0)", args: [ id, "print-store", name ] });
	}

	const { RestaurantInterface } = await import("../src/interfaces/RestaurantInterface.ts");
	const { PrintQueueInterface } = await import("../src/interfaces/PrintQueueInterface.ts");
	await RestaurantInterface.ensureTables();

	const zone = await RestaurantInterface.saveZone("print-store", { name: "Zone A", sort_order: 1 });
	const table = await RestaurantInterface.saveTable("print-store", { zone_id: zone.id, name: "A1", capacity: 2 });
	const grill = await RestaurantInterface.saveStation("print-store", { name: "Grill", category_ids: [ "cat-hot" ] });
	const bar = await RestaurantInterface.saveStation("print-store", { name: "Bar", category_ids: [ "cat-bar" ] });

	// No printers yet: the till is still the one printing, so nothing is queued.
	assert.equal(await PrintQueueInterface.hasActivePrinters("print-store"), false);
	const early = await RestaurantInterface.createOrder("print-store", { service_mode: "dine-in", table_id: table.id }, "cashier");
	const earlySent = await RestaurantInterface.sendRound("print-store", early.id, early.version, "send-early", "cashier", [{ product_id: "larb", qty: 1 }]);
	assert.equal(earlySent.rounds.length, 1);
	assert.equal(Number((await db.execute("SELECT COUNT(*) AS total FROM print_jobs")).rows[0].total), 0, "no printers means no queued jobs");
	await RestaurantInterface.cancelOrder("print-store", early.id, { expected_version: earlySent.version, reason: "smoke" }, "cashier", true);

	const grillPrinter = await PrintQueueInterface.savePrinter("print-store", { name: "Grill printer", address: "192.168.1.50:9100", station_id: grill.id });
	const barPrinter = await PrintQueueInterface.savePrinter("print-store", { name: "Bar printer", address: "192.168.1.51:9100", station_id: bar.id });
	// Station-less: takes whatever no other printer claims.
	const counterPrinter = await PrintQueueInterface.savePrinter("print-store", { name: "Counter printer", address: "192.168.1.52:9100" });
	assert.equal(await PrintQueueInterface.hasActivePrinters("print-store"), true);

	const order = await RestaurantInterface.createOrder("print-store", { service_mode: "dine-in", table_id: table.id }, "cashier");
	const sent = await RestaurantInterface.sendRound("print-store", order.id, order.version, "send-1", "cashier", [
		{ product_id: "larb", qty: 2, note: "no chilli" },
		{ product_id: "beer", qty: 3 },
		{ product_id: "rice", qty: 1 },
	]);
	assert.equal(sent.rounds.length, 1);

	const jobs = await db.execute("SELECT printer_id,station_id,payload FROM print_jobs ORDER BY printer_id");
	assert.equal(jobs.rows.length, 3, "one slip per printer with work in the round");
	const byPrinter = new Map(jobs.rows.map((row) => [ String(row.printer_id), JSON.parse(String(row.payload)) ]));
	assert.deepEqual(byPrinter.get(grillPrinter.id).items.map((item) => item.name), [ "Larb" ]);
	assert.equal(byPrinter.get(grillPrinter.id).items[0].qty, 2);
	assert.equal(byPrinter.get(grillPrinter.id).items[0].note, "no chilli");
	assert.equal(byPrinter.get(grillPrinter.id).station, "Grill");
	assert.deepEqual(byPrinter.get(barPrinter.id).items.map((item) => item.name), [ "Beer" ]);
	assert.deepEqual(byPrinter.get(counterPrinter.id).items.map((item) => item.name), [ "Rice" ], "a dish with no station falls to the catch-all printer");
	assert.equal(byPrinter.get(counterPrinter.id).label, "Zone A · A1", "the slip says where the food is going");
	assert.equal(byPrinter.get(counterPrinter.id).round, 1);

	// Re-sending the same round must not put the same food on the pass twice.
	await RestaurantInterface.sendRound("print-store", order.id, order.version, "send-1", "cashier", [{ product_id: "larb", qty: 2 }]);
	assert.equal(Number((await db.execute("SELECT COUNT(*) AS total FROM print_jobs")).rows[0].total), 3, "an idempotent re-send queues nothing new");

	const { agent, token } = await PrintQueueInterface.createAgent("print-store", { name: "counter-pc" });
	assert.match(token, /^pa_[0-9a-f]{48}$/);
	assert.equal(await PrintQueueInterface.authenticateAgent("pa_wrong"), null, "an unknown token authenticates as nobody");
	const authenticated = await PrintQueueInterface.authenticateAgent(token);
	assert.equal(authenticated.storeId, "print-store");

	const claimed = await PrintQueueInterface.claimJobs("print-store", agent.id, 10);
	assert.equal(claimed.length, 3);
	assert.ok(claimed.every((job) => job.address && job.paper_width === 80));
	assert.equal((await PrintQueueInterface.claimJobs("print-store", agent.id, 10)).length, 0, "claimed work is not handed out twice");

	await PrintQueueInterface.completeJob("print-store", claimed[0].id, true);
	await PrintQueueInterface.completeJob("print-store", claimed[1].id, false, "printer offline");
	const statuses = await db.execute({ sql: "SELECT status,error FROM print_jobs WHERE id IN (?,?) ORDER BY status", args: [ claimed[0].id, claimed[1].id ] });
	assert.deepEqual(statuses.rows.map((row) => String(row.status)).sort(), [ "done", "pending" ], "a failed slip goes back to the queue");
	assert.equal(String(statuses.rows.find((row) => String(row.status) === "pending").error), "printer offline");

	// Cancelling food already sent has to reach the kitchen whatever else is set.
	await db.execute("UPDATE stores SET kitchen_delivery_mode='screen' WHERE id='print-store'");
	const beerLine = (await db.execute({ sql: "SELECT id FROM order_items WHERE order_id=? AND product_id='beer' AND line_status='sent'", args: [order.id] })).rows[0];
	const current = await RestaurantInterface.getOrder("print-store", order.id);
	await RestaurantInterface.cancelSentItem("print-store", order.id, String(beerLine.id), { expected_version: current.version, qty: 0, reason: "sold out" }, "cashier");
	await new Promise((resolve) => setTimeout(resolve, 150));
	const voidJobs = await db.execute("SELECT payload FROM print_jobs WHERE kind='void'");
	assert.equal(voidJobs.rows.length, 1, "a cancellation reaches the kitchen even when the shop prints nothing");
	const voidPayload = JSON.parse(String(voidJobs.rows[0].payload));
	assert.equal(voidPayload.items[0].name, "Beer");
	assert.equal(voidPayload.items[0].qty, 3);
	assert.equal(voidPayload.reason, "sold out");

	// ...but an ordinary round respects the shop's own setting.
	const quiet = await RestaurantInterface.createOrder("print-store", { service_mode: "pickup", idempotency_key: "quiet-1" }, "cashier");
	await RestaurantInterface.sendRound("print-store", quiet.id, quiet.version, "send-quiet", "cashier", [{ product_id: "larb", qty: 1 }]);
	assert.equal(Number((await db.execute("SELECT COUNT(*) AS total FROM print_jobs WHERE kind='kitchen'")).rows[0].total), 3, "a screen-only kitchen queues no paper");
	await db.execute("UPDATE stores SET kitchen_delivery_mode='paper' WHERE id='print-store'");

	// Drinks are sold and stocked like anything else but never reach the kitchen.
	await RestaurantInterface.setCategoryKitchen("print-store", "cat-bar", false);
	const drinksOnly = await RestaurantInterface.createOrder("print-store", { service_mode: "pickup", idempotency_key: "drinks-1" }, "cashier");
	const drinksSent = await RestaurantInterface.sendRound("print-store", drinksOnly.id, drinksOnly.version, "send-drinks", "cashier", [{ product_id: "beer", qty: 2 }]);
	assert.equal(drinksSent.items.length, 1, "the drink is still sold and still on the bill");
	assert.equal(Number((await db.execute({ sql: "SELECT COUNT(*) AS total FROM print_jobs WHERE round_id=?", args: [drinksSent.rounds[0].id] })).rows[0].total), 0, "a drinks-only round prints nothing");

	// Its own table: the first order is still open on A1, and asking for that
	// table again would hand back the bill already sitting on it.
	const secondTable = await RestaurantInterface.saveTable("print-store", { zone_id: zone.id, name: "A2", capacity: 2 });
	const mixed = await RestaurantInterface.createOrder("print-store", { service_mode: "dine-in", table_id: secondTable.id }, "cashier");
	const mixedSent = await RestaurantInterface.sendRound("print-store", mixed.id, mixed.version, "send-mixed", "cashier", [
		{ product_id: "larb", qty: 1 },
		{ product_id: "beer", qty: 1 },
	]);
	const mixedRoundId = String(mixedSent.rounds.at(-1).id);
	const mixedJobs = await db.execute({ sql: "SELECT payload FROM print_jobs WHERE round_id=?", args: [mixedRoundId] });
	assert.equal(mixedJobs.rows.length, 1, "only the station with food to cook gets a slip");
	assert.deepEqual(JSON.parse(String(mixedJobs.rows[0].payload)).items.map((item) => item.name), [ "Larb" ]);

	// A product may break its category's rule in either direction.
	await RestaurantInterface.setProductKitchen("print-store", "beer", true);
	const override = await RestaurantInterface.createOrder("print-store", { service_mode: "pickup", idempotency_key: "override-1" }, "cashier");
	const overrideSent = await RestaurantInterface.sendRound("print-store", override.id, override.version, "send-override", "cashier", [{ product_id: "beer", qty: 1 }]);
	assert.equal(Number((await db.execute({ sql: "SELECT COUNT(*) AS total FROM print_jobs WHERE round_id=?", args: [overrideSent.rounds[0].id] })).rows[0].total), 1, "a product override beats its category");
	await RestaurantInterface.setProductKitchen("print-store", "beer", null);

	// A quick sale paid up front reaches the kitchen by the same route as a table.
	const { OrderInterface } = await import("../src/interfaces/OrderInterface.ts");
	const paid = await OrderInterface.checkout({
		store_id: "print-store", service_mode: "pickup", payment_method: "cash",
		items: [{ product_id: "larb", qty: 1 }], amount_tendered: 500,
		idempotency_key: "quick-paid-1", created_by: "cashier",
	});
	const directRound = await db.execute({ sql: "SELECT id,dispatch_mode FROM restaurant_order_rounds WHERE order_id=?", args: [paid.order_id] });
	assert.equal(directRound.rows.length, 1, "paying first still records a dispatched round");
	assert.equal(String(directRound.rows[0].dispatch_mode), "direct");
	assert.equal(Number((await db.execute({ sql: "SELECT COUNT(*) AS total FROM print_jobs WHERE round_id=?", args: [String(directRound.rows[0].id)] })).rows[0].total), 1, "a paid quick sale queues its kitchen slip");
	await OrderInterface.checkout({
		store_id: "print-store", service_mode: "pickup", payment_method: "cash",
		items: [{ product_id: "larb", qty: 1 }], amount_tendered: 500,
		idempotency_key: "quick-paid-1", created_by: "cashier",
	});
	assert.equal(Number((await db.execute({ sql: "SELECT COUNT(*) AS total FROM restaurant_order_rounds WHERE order_id=?", args: [paid.order_id] })).rows[0].total), 1, "a replayed checkout reuses its round");

	// The kitchen queue is the screen that still works when the paper runs out.
	const queue = await RestaurantInterface.kitchenQueue("print-store");
	const queuedRoundIds = queue.map((round) => String(round.id));
	assert.ok(queuedRoundIds.includes(String(directRound.rows[0].id)), "a paid quick sale is work the kitchen can see");
	assert.ok(!queuedRoundIds.includes(String(drinksSent.rounds[0].id)), "a drinks-only round is not kitchen work");
	const mixedInQueue = queue.find((round) => String(round.id) === mixedRoundId);
	assert.deepEqual(mixedInQueue.items.map((item) => String(item.name)), [ "Larb" ], "the queue shows only what has to be cooked");
	assert.equal(mixedInQueue.table_name, "A2");
	// Food that was cancelled is no longer food to cook.
	assert.ok(!queue.some((round) => round.items.some((item) => String(item.name) === "Beer")), "cancelled and non-kitchen lines stay off the queue");
	await RestaurantInterface.markKitchenRound("print-store", mixedRoundId, true, "chef");
	// A finished round does not vanish: it becomes the counter's cue to carry the
	// food out, and only drops off once that window has passed.
	const afterDone = (await RestaurantInterface.kitchenQueue("print-store")).find((round) => String(round.id) === mixedRoundId);
	assert.equal(String(afterDone.kitchen_status), "done", "a finished round is marked, not hidden");
	assert.ok(afterDone.kitchen_done_at, "and carries the time it was finished");

	// One screen per station: the grill tablet never reads the bar's drinks.
	const grillOnly = await RestaurantInterface.kitchenQueue("print-store", { stationId: grill.id });
	assert.ok(grillOnly.every((round) => round.items.every((item) => String(item.station_name) === "Grill")), "a station screen shows only its own work");
	assert.ok(grillOnly.length, "and still has work to show");

	// Settling the bill closes whatever the kitchen never ticked off: the food
	// left the pass, and a pending round would haunt the queue all day.
	const lingering = await RestaurantInterface.createOrder("print-store", { service_mode: "dine-in", table_id: table.id }, "cashier");
	const lingeringSent = await RestaurantInterface.sendRound("print-store", lingering.id, lingering.version, "send-lingering", "cashier", [{ product_id: "larb", qty: 1 }]);
	const lingeringRoundId = String(lingeringSent.rounds.at(-1).id);
	assert.ok((await RestaurantInterface.kitchenQueue("print-store")).some((round) => String(round.id) === lingeringRoundId && String(round.kitchen_status) === "pending"));
	await RestaurantInterface.checkout("print-store", lingering.id, { expected_version: lingeringSent.version, payment_method: "cash", amount_tendered: 1000 }, "cashier", "checkout-lingering");
	const closed = (await RestaurantInterface.kitchenQueue("print-store")).find((round) => String(round.id) === lingeringRoundId);
	assert.equal(String(closed.kitchen_status), "done", "paying the bill closes the rounds the kitchen never ticked off");

	// The revision counter is what lets a poll be answered without a query.
	const { kitchenRevision } = await import("../src/utils/KitchenDelivery.ts");
	const revisionBefore = kitchenRevision("print-store");
	assert.ok(revisionBefore > 0, "kitchen writes move the revision");
	await RestaurantInterface.markKitchenRound("print-store", lingeringRoundId, false, "chef");
	assert.ok(kitchenRevision("print-store") > revisionBefore, "and reopening a round moves it again");

	console.log("Print queue smoke passed: station routing, catch-all printer, dedupe, agent claim/ack, retry, cancellation slips, kitchen-exempt products, direct-sale rounds, delivery modes, per-station screens, bill-closes-rounds, and the revision counter");
} finally {
	await rm(tempDirectory, { recursive: true, force: true });
}
