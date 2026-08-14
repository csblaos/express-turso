// End-to-end check of paying in a currency other than the shop's own.
//
// Runs the real OrderInterface.checkout against a throwaway sqlite file, so the
// SQL, the migration and the rate lock are all exercised rather than mocked.
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directory = await mkdtemp(join(tmpdir(), "pos-currency-"));
process.env.DATABASE_URL = `file:${join(directory, "database.db")}`;
process.env.TURSO_DATABASE_URL = "";

const results = [];
const check = (name, fn) => {
	try { fn(); results.push([ name, true ]); }
	catch (error) { results.push([ `${name} — ${error.message}`, false ]); }
};

try {
	const { DbConn } = await import("../src/connections/DbConn.ts");
	await DbConn.connect();
	const db = DbConn.getClient();

	await db.execute(`CREATE TABLE orders(id TEXT PRIMARY KEY,store_id TEXT,order_no TEXT,channel TEXT,status TEXT,subtotal REAL DEFAULT 0,discount REAL DEFAULT 0,vat_amount REAL DEFAULT 0,shipping_fee_charged REAL DEFAULT 0,total REAL,shipping_cost REAL DEFAULT 0,paid_at TEXT,created_by TEXT,created_at TEXT,payment_currency TEXT,payment_method TEXT,payment_account_id TEXT,payment_slip_url TEXT,payment_proof_submitted_at TEXT,payment_status TEXT)`);
	await db.execute(`CREATE TABLE order_items(id TEXT PRIMARY KEY,order_id TEXT,product_id TEXT,unit_id TEXT,qty REAL,qty_base REAL,price_base_at_sale REAL,cost_base_at_sale REAL,line_total REAL,is_gift INTEGER,promotion_id TEXT,cost_source_at_sale TEXT,line_status TEXT)`);
	await db.execute(`CREATE TABLE products(id TEXT PRIMARY KEY,store_id TEXT,name TEXT,sku TEXT,base_unit_id TEXT,price_base REAL,cost_base REAL,active INTEGER,inventory_mode TEXT,manual_sold_out INTEGER,cost_source TEXT)`);
	await db.execute("CREATE TABLE inventory_balances(store_id TEXT,product_id TEXT,on_hand_base REAL,reserved_base REAL,available_base REAL,updated_at TEXT,PRIMARY KEY(store_id,product_id))");
	await db.execute("CREATE TABLE inventory_movements(id TEXT PRIMARY KEY,store_id TEXT,product_id TEXT,type TEXT,qty_base REAL,ref_type TEXT,ref_id TEXT,note TEXT,created_by TEXT,created_at TEXT)");
	await db.execute("CREATE TABLE cash_flow_entries(id TEXT PRIMARY KEY,store_id TEXT,account_id TEXT,direction TEXT,entry_type TEXT,source_type TEXT,source_id TEXT,amount REAL,currency TEXT,reference TEXT,note TEXT,metadata TEXT,occurred_at TEXT,created_by TEXT,created_at TEXT)");
	await db.execute("CREATE TABLE idempotency_requests(id TEXT PRIMARY KEY,store_id TEXT,action TEXT,idempotency_key TEXT,request_hash TEXT,status TEXT,response_status INTEGER,response_body TEXT,created_by TEXT,created_at TEXT,completed_at TEXT)");
	await db.execute("CREATE TABLE audit_events(id TEXT PRIMARY KEY,scope TEXT,store_id TEXT,actor_user_id TEXT,actor_role TEXT,action TEXT,entity_type TEXT,entity_id TEXT,result TEXT,request_id TEXT,metadata TEXT,occurred_at TEXT)");
	await db.execute("CREATE TABLE order_promotions(id TEXT PRIMARY KEY,order_id TEXT,promotion_id TEXT,promotion_name TEXT,promotion_type TEXT,applications INTEGER,gift_product_id TEXT,gift_qty INTEGER,discount_method TEXT,discount_value REAL,discount_amount REAL,created_at TEXT)");

	const now = new Date().toISOString();
	await db.execute({ sql: "INSERT INTO stores(id,name,currency,supported_currencies,created_at) VALUES('shop','Wow Pizza','LAK','LAK,THB,USD',?)", args: [ now ] });
	await db.execute("INSERT INTO products VALUES('pizza','shop','Pizza','PZ','unit',157300,50000,1,'untracked',0,'manual')");
	await db.execute("INSERT INTO inventory_balances VALUES('shop','pizza',999,0,999,'')");

	// The report reads a wider slice of the schema than checkout does.
	await db.execute("CREATE TABLE product_categories(id TEXT PRIMARY KEY,store_id TEXT,name TEXT,sort_order INTEGER)");
	await db.execute("ALTER TABLE products ADD COLUMN category_id TEXT");
	await db.execute("ALTER TABLE products ADD COLUMN deleted_at TEXT");
	await db.execute("ALTER TABLE products ADD COLUMN low_stock_threshold REAL");
	await db.execute("ALTER TABLE orders ADD COLUMN closed_at TEXT");
	await db.execute("ALTER TABLE orders ADD COLUMN service_mode TEXT");
	await db.execute("ALTER TABLE orders ADD COLUMN amount_tendered REAL DEFAULT 0");
	await db.execute("ALTER TABLE orders ADD COLUMN change_amount REAL DEFAULT 0");

	const { StoreCurrencyRateInterface } = await import("../src/interfaces/StoreCurrencyRateInterface.ts");
	await StoreCurrencyRateInterface.replaceRates("shop", [ { currency: "THB", rate_to_base: 640 } ]);

	const { OrderInterface } = await import("../src/interfaces/OrderInterface.ts");
	const sell = (extra) => OrderInterface.checkout({
		store_id: "shop", service_mode: "walk-in", payment_method: "cash",
		items: [ { product_id: "pizza", qty: 1 } ], created_by: "cashier",
		idempotency_key: `key-${Math.random()}`, ...extra,
	});
	const orderRow = async (id) => (await db.execute({ sql: "SELECT * FROM orders WHERE id = ?", args: [ id ] })).rows[0];

	// --- an ordinary kip sale is untouched ----------------------------------
	const kip = await sell({ amount_tendered: 200_000 });

	// Checked after the first sale, because ensureTables() is what runs the
	// migration and it only runs on checkout.
	const columns = new Set((await db.execute("PRAGMA table_info(orders)")).rows.map((row) => String(row.name)));
	check("migration adds payment_exchange_rate", () => assert.ok(columns.has("payment_exchange_rate")));
	check("migration adds amount_tendered_foreign", () => assert.ok(columns.has("amount_tendered_foreign")));

	const kipRow = await orderRow(kip.order_id);
	check("kip sale still books the tender it was given", () => assert.equal(kip.amount_tendered, 200_000));
	check("kip sale change is unchanged", () => assert.equal(kip.change_amount, 42_700));
	check("kip sale records the base currency", () => assert.equal(kipRow.payment_currency, "LAK"));
	check("kip sale records a rate of 1", () => assert.equal(Number(kipRow.payment_exchange_rate), 1));
	check("kip sale stores no foreign tender", () => assert.equal(kipRow.amount_tendered_foreign, null));

	// --- paying 246 THB for a 157,300 LAK bill ------------------------------
	const baht = await sell({ payment_currency: "THB", amount_tendered_foreign: 246, expected_exchange_rate: 640 });
	const bahtRow = await orderRow(baht.order_id);
	check("the bill total stays in kip", () => assert.equal(baht.total, 157_300));
	check("246 THB is booked as 157,440 LAK", () => assert.equal(baht.amount_tendered, 157_440));
	check("change comes back in kip, whole", () => assert.equal(baht.change_amount, 140));
	check("the currency is recorded on the order", () => assert.equal(bahtRow.payment_currency, "THB"));
	check("the rate is locked onto the order", () => assert.equal(Number(bahtRow.payment_exchange_rate), 640));
	check("the baht the customer handed over is kept", () => assert.equal(Number(bahtRow.amount_tendered_foreign), 246));

	const flow = (await db.execute({ sql: "SELECT * FROM cash_flow_entries WHERE source_id = ?", args: [ baht.order_id ] })).rows[0];
	check("cash flow stays denominated in kip so reports keep adding up", () => {
		assert.equal(flow.currency, "LAK");
		assert.equal(Number(flow.amount), 157_300);
	});
	check("cash flow metadata carries the foreign detail", () => {
		const meta = JSON.parse(String(flow.metadata));
		assert.equal(meta.payment_currency, "THB");
		assert.equal(meta.exchange_rate, 640);
		assert.equal(meta.amount_tendered_foreign, 246);
	});

	// --- a baht transfer settles exactly ------------------------------------
	await db.execute("CREATE TABLE store_payment_accounts_placeholder(x)").catch(() => undefined);
	const { StorePaymentAccountInterface } = await import("../src/interfaces/StorePaymentAccountInterface.ts");
	await StorePaymentAccountInterface.ensureTable();
	await db.execute("INSERT INTO store_payment_accounts(id,store_id,display_name,account_name,bank_name,account_number,is_active,qr_image_url,currency) VALUES('thb-acct','shop','Thai account','Shop','SCB','111',1,'qr.png','THB')");
	const transfer = await sell({ payment_method: "qr_transfer", payment_account_id: "thb-acct", payment_currency: "THB", expected_exchange_rate: 640 });
	const transferRow = await orderRow(transfer.order_id);
	check("a transfer is booked at the bill total exactly", () => {
		assert.equal(transfer.amount_tendered, 157_300);
		assert.equal(transfer.change_amount, 0);
	});
	check("a transfer still records what it cost in baht", () =>
		assert.equal(Number(transferRow.amount_tendered_foreign), 245.78));

	// --- refusals -----------------------------------------------------------
	const refuses = async (name, extra, match) => {
		try { await sell(extra); results.push([ `${name} (was accepted)`, false ]); }
		catch (error) { results.push([ name, String(error.message || "").includes(match) ]); }
	};
	await refuses("a rate that moved is refused", { payment_currency: "THB", amount_tendered_foreign: 246, expected_exchange_rate: 600 }, "exchange rate changed");
	await refuses("a currency with no rate is refused", { payment_currency: "USD", amount_tendered_foreign: 10, expected_exchange_rate: 21500 }, "no exchange rate");
	await refuses("too little foreign cash is refused", { payment_currency: "THB", amount_tendered_foreign: 10, expected_exchange_rate: 640 }, "less than total");

	await db.execute("UPDATE stores SET supported_currencies='LAK' WHERE id='shop'");
	await refuses("a currency the shop disabled is refused", { payment_currency: "THB", amount_tendered_foreign: 246, expected_exchange_rate: 640 }, "not enabled");

	// --- what the owner has to physically collect ---------------------------
	// Three sales are on the books by now: kip cash 157,300 (tendered 200,000,
	// change 42,700), baht cash 246 THB (change 140 kip), and a baht transfer.
	const { ReportInterface } = await import("../src/interfaces/ReportInterface.ts");
	await db.execute("UPDATE orders SET status='completed', payment_status='paid'");
	const report = await ReportInterface.dashboard("shop", { preset: "30d", timezoneOffset: 0 });
	const takings = report.cash_takings;
	const drawerOf = (code) => takings.drawer.find((entry) => entry.currency === code);

	check("takings report the base currency of the shop", () => assert.equal(takings.base_currency, "LAK"));
	check("baht notes are counted in baht, not converted kip", () =>
		assert.equal(drawerOf("THB").amount, 246));
	check("the kip drawer nets off change given on the baht sale", () => {
		// 157,300 taken in kip, minus the 140 kip handed back to the baht customer.
		assert.equal(drawerOf("LAK").amount, 157_300 - 140);
	});
	check("the transfer is not counted as cash in the drawer", () =>
		assert.equal(takings.bank_amount, 157_300));
	check("drawer totals convert back to kip for the bottom line", () =>
		assert.equal(takings.drawer_total_base, 157_300 - 140 + 157_440));
	check("drawer plus bank equals the period revenue", () => {
		const collected = takings.drawer_total_base + takings.bank_amount + takings.card_amount;
		assert.equal(collected, report.summary.revenue);
	});

	const bahtSummary = report.payment_currencies.find((entry) => entry.currency === "THB");
	const kipSummary = report.payment_currencies.find((entry) => entry.currency === "LAK");
	check("the base currency is listed first", () => assert.equal(report.payment_currencies[0].currency, "LAK"));
	check("the kip line carries no foreign amount", () => assert.equal(kipSummary.amount_foreign, null));
	check("baht bills are counted and summed in baht", () => {
		assert.equal(bahtSummary.bill_count, 2);
		assert.equal(Math.round(bahtSummary.amount_foreign * 100) / 100, 246 + 245.78);
	});
	check("the rate shown is weighted by what was actually taken", () => {
		// (157,440 + 157,300) / (246 + 245.78), not whatever the rate says today.
		const expected = (157_440 + 157_300) / (246 + 245.78);
		assert.ok(Math.abs(bahtSummary.exchange_rate - expected) < 0.001);
	});
	check("currency shares add up to the whole period", () => {
		const total = report.payment_currencies.reduce((sum, entry) => sum + entry.percent, 0);
		assert.ok(Math.abs(total - 100) < 0.01);
	});
} finally {
	await rm(directory, { recursive: true, force: true });
}

let failed = 0;
for (const [ name, ok ] of results) {
	console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
	if (!ok) failed += 1;
}
console.log(failed ? `\n${failed} of ${results.length} failed` : `\nall ${results.length} passed`);
process.exit(failed ? 1 : 0);
