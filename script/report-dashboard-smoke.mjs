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
	await db.execute(`CREATE TABLE orders(id TEXT PRIMARY KEY,store_id TEXT,status TEXT,payment_status TEXT,subtotal REAL DEFAULT 0,discount REAL DEFAULT 0,vat_amount REAL DEFAULT 0,shipping_fee_charged REAL DEFAULT 0,total REAL,shipping_cost REAL DEFAULT 0,paid_at TEXT,closed_at TEXT,created_at TEXT,created_by TEXT,payment_method TEXT,payment_account_id TEXT,service_mode TEXT,channel TEXT,payment_currency TEXT,amount_tendered REAL DEFAULT 0,change_amount REAL DEFAULT 0)`);
	await db.execute(`CREATE TABLE order_items(id TEXT PRIMARY KEY,order_id TEXT,product_id TEXT,qty_base REAL,line_total REAL,line_status TEXT,is_gift INTEGER,promotion_id TEXT,cost_base_at_sale REAL,cost_source_at_sale TEXT)`);
	await db.execute(`CREATE TABLE order_promotions(id TEXT PRIMARY KEY,order_id TEXT,promotion_id TEXT,promotion_name TEXT,promotion_type TEXT,applications INTEGER,gift_product_id TEXT,gift_qty INTEGER,discount_method TEXT,discount_value REAL,discount_amount REAL,created_at TEXT)`);
	await db.execute(`CREATE TABLE products(id TEXT PRIMARY KEY,store_id TEXT,name TEXT,sku TEXT,active INTEGER,deleted_at TEXT,inventory_mode TEXT,low_stock_threshold REAL,category_id TEXT,cost_base REAL DEFAULT 0)`);
	await db.execute(`CREATE TABLE product_categories(id TEXT PRIMARY KEY,store_id TEXT,name TEXT,sort_order INTEGER)`);
	await db.execute(`CREATE TABLE inventory_balances(store_id TEXT,product_id TEXT,on_hand_base REAL DEFAULT 0,reserved_base REAL DEFAULT 0,available_base REAL)`);
	await db.execute(`CREATE TABLE inventory_movements(id TEXT PRIMARY KEY,store_id TEXT,product_id TEXT,type TEXT,qty_base REAL,ref_type TEXT,ref_id TEXT,note TEXT,created_by TEXT,created_at TEXT)`);
	await db.execute("UPDATE stores SET currency='LAK',low_stock_threshold=5 WHERE id='report-store'").catch(() => undefined);
	await db.execute("INSERT INTO stores(id,name,currency,low_stock_threshold,created_at) VALUES('report-store','Report Store','LAK',5,?)", [new Date().toISOString()]);
	await db.execute("INSERT INTO users(name,email,created_at) VALUES('Cashier','cashier@test.local',?)", [new Date().toISOString()]);
	const user = String((await db.execute("SELECT id FROM users WHERE email='cashier@test.local'")).rows[0].id);
	const paidAt = new Date().toISOString();
	const orders = [
		["paid","completed","paid",1000,"cash",null],
		["open","open","unpaid",900,"cash",null],
		["cancelled","cancelled","unpaid",800,"cash",null],
		["qr-a","completed","paid",500,"qr_transfer","acct-active"],
		["qr-a2","completed","paid",300,"qr_transfer","acct-active"],
		["qr-old","completed","paid",200,"qr_transfer","acct-closed"],
		["qr-none","completed","paid",100,"qr_transfer",null],
	];
	for (const [id,status,paymentStatus,total,method,accountId] of orders) await db.execute({sql:"INSERT INTO orders(id,store_id,status,payment_status,subtotal,total,paid_at,closed_at,created_at,created_by,payment_method,payment_account_id,service_mode,channel) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",args:[id,"report-store",status,paymentStatus,total,total,status==="completed"?paidAt:null,status==="cancelled"?paidAt:null,paidAt,user,method,accountId,"quick_sale","pos"]});
	const { StorePaymentAccountInterface } = await import("../src/interfaces/StorePaymentAccountInterface.ts");
	await StorePaymentAccountInterface.ensureTable();
	await db.execute("INSERT INTO store_payment_accounts(id,store_id,display_name,account_name,bank_name,account_number,is_active,qr_image_url,currency) VALUES('acct-active','report-store','BCEL One','Shop','BCEL','0101234567',1,'qr.png','LAK')");
	await db.execute("INSERT INTO store_payment_accounts(id,store_id,display_name,account_name,bank_name,account_number,is_active,qr_image_url,currency) VALUES('acct-closed','report-store','Closed','Shop','LDB','0300000000',0,NULL,'LAK')");
	await db.execute("INSERT INTO product_categories VALUES('drinks','report-store','Drinks',1)");
	await db.execute("INSERT INTO products(id,store_id,name,sku,active,deleted_at,inventory_mode,low_stock_threshold,category_id,cost_base) VALUES('known','report-store','Known','KNOWN',1,NULL,'tracked',3,'drinks',200)");
	await db.execute("INSERT INTO products(id,store_id,name,sku,active,deleted_at,inventory_mode,low_stock_threshold,category_id,cost_base) VALUES('unknown','report-store','Unknown','UNKNOWN',1,NULL,'untracked',NULL,NULL,0)");
	await db.execute("INSERT INTO inventory_balances(store_id,product_id,on_hand_base,reserved_base,available_base) VALUES('report-store','known',2,0,2)");
	await db.execute("INSERT INTO order_items VALUES('line-1','paid','known',2,800,'sent',0,NULL,200,'purchase')");
	await db.execute("INSERT INTO order_items VALUES('gift-1','paid','known',1,0,'sent',1,NULL,200,'purchase')");
	await db.execute("INSERT INTO order_items VALUES('line-2','paid','unknown',1,200,'sent',0,NULL,0,'unknown')");
	await db.execute("INSERT INTO order_items VALUES('cancelled-line','paid','known',99,9900,'cancelled',0,NULL,200,'purchase')");
	await db.execute({sql:"INSERT INTO inventory_movements VALUES('mv-in','report-store','known','ADJUSTMENT_IN',10,'purchase_order','po-1',NULL,?,?)",args:[user,paidAt]});
	await db.execute({sql:"INSERT INTO inventory_movements VALUES('mv-sale','report-store','known','SALE_OUT',-2,'order','paid',NULL,?,?)",args:[user,paidAt]});
	await db.execute({sql:"INSERT INTO inventory_movements VALUES('mv-out','report-store','known','ADJUSTMENT_OUT',-1,'manual_adjustment',NULL,'spoiled',?,?)",args:[user,paidAt]});

	const { ReportInterface } = await import("../src/interfaces/ReportInterface.ts");
	const report = await ReportInterface.dashboard("report-store", { preset:"today", timezoneOffset:420 });
	assert.equal(report.summary.revenue, 2100, "cash 1000 + transfers 500+300+200+100");
	assert.equal(report.summary.bill_count, 5);
	assert.equal(report.summary.cancelled_refunded_count, 1);
	assert.equal(report.summary.gross_sales, 2100);
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
	assert.equal((await ReportInterface.dashboard("report-store", {preset:"7d",timezoneOffset:420})).summary.revenue, 2100);

	assert.equal(report.uncosted_products.length, 1, "the product with no cost is named, not just counted");
	assert.equal(report.uncosted_products[0].name, "Unknown");
	assert.equal(report.uncosted_products[0].revenue, 200);
	assert.equal(report.uncosted_products[0].bill_count, 1);
	// Coverage must divide item revenue by item revenue. The fixture bills total
	// 2,100 while their items total 1,000, so the old orders.total base gave 90.5%.
	assert.equal(Math.round(report.profitability.cost_coverage_percent), 80, "coverage compares item revenue with item revenue");

	const byType = Object.fromEntries(report.product_type_performance.map((row) => [row.mode, row]));
	assert.equal(report.product_type_performance.length, 2, "always both buckets, even when one has no sales");
	assert.equal(byType.tracked.revenue, 800, "stocked goods: the costed line only, gifts excluded");
	assert.equal(byType.tracked.known_cost, 600, "stocked cost includes the gift given away");
	assert.equal(byType.tracked.gift_cost, 200);
	assert.equal(byType.tracked.unknown_cost_revenue, 0);
	assert.equal(byType.tracked.cost_coverage_percent, 100, "every stocked sale has a cost behind it");
	assert.equal(byType.tracked.gross_profit, 200, "800 revenue - 600 cost");
	assert.equal(byType.untracked.revenue, 200, "the menu item sold for 200");
	assert.equal(byType.untracked.unknown_cost_revenue, 200, "with no cost recorded");
	assert.equal(byType.untracked.unknown_cost_products, 1);
	assert.equal(byType.untracked.cost_coverage_percent, 0, "so none of that revenue can be turned into profit");
	assert.equal(byType.untracked.gross_profit, 0, "uncosted revenue is never counted as pure profit");
	assert.equal(byType.untracked.margin, 0);
	assert.equal(
		Math.round(byType.tracked.revenue + byType.untracked.revenue),
		Math.round(report.summary.revenue - 1100),
		"the two buckets add up to the sales revenue (the 1,100 of transfers carry no items in this fixture)",
	);

	const accounts = Object.fromEntries(report.payment_accounts.map((row) => [row.id, row]));
	assert.equal(report.payment_accounts.length, 3, "one row per receiving account, plus the unassigned bucket");
	assert.equal(accounts["acct-active"].amount, 800, "two transfers to the same account are summed");
	assert.equal(accounts["acct-active"].bill_count, 2);
	assert.equal(accounts["acct-active"].has_qr, true);
	assert.equal(accounts["acct-active"].is_active, true);
	assert.equal(Math.round(accounts["acct-active"].percent), 73, "share is of transfers only, not of all revenue");
	assert.equal(accounts["acct-closed"].amount, 200, "a deactivated account still reports the money it received");
	assert.equal(accounts["acct-closed"].is_active, false);
	assert.equal(accounts["acct-closed"].has_qr, false);
	assert.equal(accounts.unassigned.amount, 100, "transfers with no account recorded are surfaced, not dropped");
	assert.equal(report.payment_accounts.some((row) => row.amount === 1000), false, "cash never appears in the account breakdown");
	const products=await ReportInterface.products("report-store",{preset:"today",timezoneOffset:420},{sort:"revenue",order:"desc",page:1,limit:20});
	assert.equal(products.pagination.total,2);assert.equal(products.items[0].name,"Known");assert.equal(products.items[0].quantity,2);assert.equal(products.items[0].average_price,400);assert.equal(products.items[0].category_name,"Drinks");
	// The product tab's summary quotes these, and they have to cover every matching
	// row rather than the page that happens to be on screen.
	assert.equal(products.totals.product_count,2);
	assert.equal(products.totals.quantity,products.items.reduce((sum,item)=>sum+item.quantity,0));
	assert.equal(products.totals.revenue,products.items.reduce((sum,item)=>sum+item.revenue,0));
	const paged=await ReportInterface.products("report-store",{preset:"today",timezoneOffset:420},{sort:"revenue",order:"desc",page:1,limit:1});
	assert.equal(paged.items.length,1);assert.equal(paged.totals.product_count,2,"totals ignore the page size");
	assert.equal(paged.totals.quantity,products.totals.quantity);
	// Only the top ten uncosted products are named, so the count comes separately.
	assert.equal(report.profitability.unknown_cost_products,report.uncosted_products.length);
	const stock=await ReportInterface.stock("report-store",{preset:"today",timezoneOffset:420});
	// Two on hand at the 200 fallback cost, because nothing was ever received
	// through a purchase order for this product.
	assert.equal(stock.summary.inventory_value,400);assert.equal(stock.summary.product_count,1);
	assert.equal(stock.summary.tracked_count,1,"untracked products stay out of the stock report");
	assert.equal(stock.summary.low_count,1);assert.equal(stock.summary.ready_count,0);assert.equal(stock.summary.out_count,0);assert.equal(stock.summary.negative_count,0);
	// A manual write-off is not a sale, so the two never share a bar.
	assert.equal(stock.summary.received_qty,10);assert.equal(stock.summary.sold_qty,2);assert.equal(stock.summary.removed_qty,1);
	assert.equal(stock.categories[0].name,"Drinks");assert.equal(stock.categories[0].value,400);
	assert.equal(stock.top_products[0].id,"known");assert.equal(stock.top_products[0].unit_cost,200);
	assert.equal(stock.low_stock[0].id,"known");assert.equal(stock.low_stock[0].threshold,3);
	assert.equal(stock.movement_series.reduce((sum,item)=>sum+item.in_qty,0),10,"the series adds back up to the period total");
	const trend=await ReportInterface.productTrend("report-store","known",{preset:"today",timezoneOffset:420});assert.equal(trend.items[0].quantity,2);
	const periods=(await import("../src/interfaces/ReportInterface.ts")).resolveReportPeriods({preset:"last_week",timezoneOffset:420},new Date("2026-07-29T05:00:00Z"));assert.equal(periods.current.days,7);assert.equal(periods.current.date_from,"2026-07-20");assert.equal(periods.current.date_to,"2026-07-26");
	await assert.rejects(()=>ReportInterface.dashboard("report-store",{preset:"custom",dateFrom:"2025-01-01",dateTo:"2026-07-29",timezoneOffset:420}));
	console.log("Report dashboard smoke passed: presets, buckets, charts, products, costs, gifts, staff, and stock");
	db.close();
} finally {
	await rm(directory, { recursive:true, force:true });
}
