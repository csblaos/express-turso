import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directory = await mkdtemp(join(tmpdir(), "report-dashboard-"));
process.env.DATABASE_URL = `file:${join(directory, "database.db")}`;
process.env.TURSO_DATABASE_URL = "";

try {
	const { DbConn } = await import("../src/connections/DbConn.ts");
	await DbConn.connect();
	const db = DbConn.getClient();
	await db.execute(`CREATE TABLE orders(id TEXT PRIMARY KEY,store_id TEXT,status TEXT,payment_status TEXT,subtotal REAL DEFAULT 0,discount REAL DEFAULT 0,vat_amount REAL DEFAULT 0,shipping_fee_charged REAL DEFAULT 0,total REAL,shipping_cost REAL DEFAULT 0,paid_at TEXT,closed_at TEXT,created_at TEXT,created_by TEXT,payment_method TEXT,service_mode TEXT,channel TEXT)`);
	await db.execute(`CREATE TABLE order_items(id TEXT PRIMARY KEY,order_id TEXT,product_id TEXT,qty_base REAL,line_total REAL,line_status TEXT,is_gift INTEGER,promotion_id TEXT,cost_base_at_sale REAL,cost_source_at_sale TEXT)`);
	await db.execute(`CREATE TABLE order_promotions(id TEXT PRIMARY KEY,order_id TEXT,promotion_id TEXT,promotion_name TEXT,promotion_type TEXT,applications INTEGER,gift_product_id TEXT,gift_qty INTEGER,discount_method TEXT,discount_value REAL,discount_amount REAL,created_at TEXT)`);
	await db.execute(`CREATE TABLE products(id TEXT PRIMARY KEY,store_id TEXT,name TEXT,sku TEXT,active INTEGER,deleted_at TEXT,inventory_mode TEXT,low_stock_threshold REAL,category_id TEXT,cost_base REAL DEFAULT 0)`);
	await db.execute(`CREATE TABLE product_categories(id TEXT PRIMARY KEY,store_id TEXT,name TEXT,sort_order INTEGER)`);
	await db.execute(`CREATE TABLE inventory_balances(store_id TEXT,product_id TEXT,available_base REAL)`);
	await db.execute("UPDATE stores SET currency='LAK',low_stock_threshold=5 WHERE id='report-store'").catch(() => undefined);
	await db.execute("INSERT INTO stores(id,name,currency,low_stock_threshold,created_at) VALUES('report-store','Report Store','LAK',5,?)", [new Date().toISOString()]);
	await db.execute("INSERT INTO users(name,email,created_at) VALUES('Cashier','cashier@test.local',?)", [new Date().toISOString()]);
	const user = String((await db.execute("SELECT id FROM users WHERE email='cashier@test.local'")).rows[0].id);
	const paidAt = new Date().toISOString();
	const orders = [
		["paid","completed","paid",1000,"cash"],
		["open","open","unpaid",900,"cash"],
		["cancelled","cancelled","unpaid",800,"cash"],
	];
	for (const [id,status,paymentStatus,total,method] of orders) await db.execute({sql:"INSERT INTO orders(id,store_id,status,payment_status,subtotal,total,paid_at,closed_at,created_at,created_by,payment_method,service_mode,channel) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",args:[id,"report-store",status,paymentStatus,total,total,status==="completed"?paidAt:null,status==="cancelled"?paidAt:null,paidAt,user,method,"quick_sale","pos"]});
	await db.execute("INSERT INTO product_categories VALUES('drinks','report-store','Drinks',1)");
	await db.execute("INSERT INTO products(id,store_id,name,sku,active,deleted_at,inventory_mode,low_stock_threshold,category_id,cost_base) VALUES('known','report-store','Known','KNOWN',1,NULL,'tracked',3,'drinks',200)");
	await db.execute("INSERT INTO products(id,store_id,name,sku,active,deleted_at,inventory_mode,low_stock_threshold,category_id,cost_base) VALUES('unknown','report-store','Unknown','UNKNOWN',1,NULL,'untracked',NULL,NULL,0)");
	await db.execute("INSERT INTO inventory_balances VALUES('report-store','known',2)");
	await db.execute("INSERT INTO order_items VALUES('line-1','paid','known',2,800,'sent',0,NULL,200,'purchase')");
	await db.execute("INSERT INTO order_items VALUES('gift-1','paid','known',1,0,'sent',1,NULL,200,'purchase')");
	await db.execute("INSERT INTO order_items VALUES('line-2','paid','unknown',1,200,'sent',0,NULL,0,'unknown')");
	await db.execute("INSERT INTO order_items VALUES('cancelled-line','paid','known',99,9900,'cancelled',0,NULL,200,'purchase')");

	const { ReportInterface } = await import("../src/interfaces/ReportInterface.ts");
	const report = await ReportInterface.dashboard("report-store", { preset:"today", timezoneOffset:420 });
	assert.equal(report.summary.revenue, 1000);
	assert.equal(report.summary.bill_count, 1);
	assert.equal(report.summary.cancelled_refunded_count, 1);
	assert.equal(report.summary.gross_sales, 1000);
	assert.equal(report.summary.discount, 0);
	assert.equal(report.profitability.known_cost, 600, "known cost includes the gift cost");
	assert.equal(report.profitability.unknown_cost_revenue, 200);
	assert.equal(report.top_products.find((item) => item.id === "known")?.quantity, 2, "top products exclude gifts and cancelled lines");
	assert.equal(report.low_stock[0].id, "known");
	assert.equal(report.staff_ranking[0].name, "Cashier");
	assert.equal(report.period.from.endsWith("17:00:00.000Z"), true);
	assert.equal(report.sales_series.length,24,"today includes empty hourly buckets");
	assert.equal(report.order_type_mix[0].type,"quick_sale");
	assert.equal(report.product_mix.length,2);
	assert.equal(report.category_performance[0].name,"Drinks");
	assert.equal(report.operational_signals.out_of_stock_count,0);
	assert.equal(report.operational_signals.inventory_value,400);
	assert.equal(report.heatmap.length,1);
	assert.equal((await ReportInterface.dashboard("report-store", {preset:"7d",timezoneOffset:420})).summary.revenue, 1000);
	const products=await ReportInterface.products("report-store",{preset:"today",timezoneOffset:420},{sort:"revenue",order:"desc",page:1,limit:20});
	assert.equal(products.pagination.total,2);assert.equal(products.items[0].name,"Known");assert.equal(products.items[0].quantity,2);assert.equal(products.items[0].average_price,400);assert.equal(products.items[0].category_name,"Drinks");
	const trend=await ReportInterface.productTrend("report-store","known",{preset:"today",timezoneOffset:420});assert.equal(trend.items[0].quantity,2);
	const periods=(await import("../src/interfaces/ReportInterface.ts")).resolveReportPeriods({preset:"last_week",timezoneOffset:420},new Date("2026-07-29T05:00:00Z"));assert.equal(periods.current.days,7);assert.equal(periods.current.date_from,"2026-07-20");assert.equal(periods.current.date_to,"2026-07-26");
	await assert.rejects(()=>ReportInterface.dashboard("report-store",{preset:"custom",dateFrom:"2025-01-01",dateTo:"2026-07-29",timezoneOffset:420}));
	console.log("Report dashboard smoke passed: presets, buckets, charts, products, costs, gifts, staff, and stock");
	db.close();
} finally {
	await rm(directory, { recursive:true, force:true });
}
