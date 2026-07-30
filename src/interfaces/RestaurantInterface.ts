import { randomUUID } from "crypto";

import { DbConn } from "@connections/DbConn";
import { AuditEventInterface } from "@interfaces/AuditEventInterface";
import { OrderInterface } from "@interfaces/OrderInterface";
import { ProductInterface } from "@interfaces/ProductInterface";
import { PromotionInterface } from "@interfaces/PromotionInterface";
import { ApiError } from "@middlewares/ApiError";
import { allocateRestaurantQueue, restaurantDate } from "@utils/RestaurantQueue";

type Executor = {
	execute: (statement: any) => Promise<any>;
	batch?: (statements: any[]) => Promise<any[]>;
};

function now(): string { return new Date().toISOString(); }
function text(value: unknown): string { return String(value ?? "").trim(); }
function number(value: unknown): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function conflict(message: string): ApiError {
	return ApiError.CustomError({ code: 409_101, message, httpStatusCode: 409 });
}

export class RestaurantInterface {
	private static initialized = false;
	private static initializationPromise: Promise<void> | null = null;
	private static async audit(executor:Executor,storeId:string,actorId:string,action:string,entityType:string,entityId:string,metadata:Record<string,unknown>={}):Promise<void>{
		await executor.execute({sql:`INSERT INTO audit_events(id,scope,store_id,actor_user_id,actor_role,action,entity_type,entity_id,result,request_id,metadata,occurred_at)
			VALUES(?,'store',? ,?,'store_member',?,?,?,'success',NULL,?,?)`,args:[randomUUID(),storeId,actorId,action,entityType,entityId,JSON.stringify(metadata),now()]});
	}
	private static auditAsync(storeId:string,actorId:string,action:string,entityType:string,entityId:string,metadata:Record<string,unknown>={}):void{
		void DbConn.getClient().execute({sql:`INSERT INTO audit_events(id,scope,store_id,actor_user_id,actor_role,action,entity_type,entity_id,result,request_id,metadata,occurred_at)
			VALUES(?,'store',? ,?,'store_member',?,?,?,'success',NULL,?,?)`,args:[randomUUID(),storeId,actorId,action,entityType,entityId,JSON.stringify(metadata),now()]})
			.catch((error)=>console.error(`[audit] ${action} failed`,error));
	}

	static async ensureTables(): Promise<void> {
		if (RestaurantInterface.initialized) return;
		if (RestaurantInterface.initializationPromise) return RestaurantInterface.initializationPromise;

		RestaurantInterface.initializationPromise = (async () => {
			await OrderInterface.ensureTables();
			await AuditEventInterface.ensureTable();
			await ProductInterface.ensureColumns();
			await PromotionInterface.ensureTables();
			const db = DbConn.getClient();
			await db.execute(`CREATE TABLE IF NOT EXISTS restaurant_zones (
			id TEXT PRIMARY KEY, store_id TEXT NOT NULL, name TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0,
			is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
			UNIQUE(store_id, name)
		)`);
		await db.execute(`CREATE TABLE IF NOT EXISTS restaurant_tables (
			id TEXT PRIMARY KEY, store_id TEXT NOT NULL, zone_id TEXT NOT NULL, name TEXT NOT NULL, code TEXT,
			capacity INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL DEFAULT 0, is_active INTEGER NOT NULL DEFAULT 1,
			created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(store_id, zone_id, name)
		)`);
		await db.execute(`CREATE TABLE IF NOT EXISTS restaurant_order_rounds (
			id TEXT PRIMARY KEY, order_id TEXT NOT NULL, round_no INTEGER NOT NULL, sent_by TEXT NOT NULL,
			sent_at TEXT NOT NULL, idempotency_key TEXT NOT NULL, UNIQUE(order_id, round_no), UNIQUE(order_id, idempotency_key)
		)`);
		await db.execute(`CREATE TABLE IF NOT EXISTS restaurant_daily_sequences (
			store_id TEXT NOT NULL, sequence_date TEXT NOT NULL, last_queue_no INTEGER NOT NULL DEFAULT 0,
			PRIMARY KEY(store_id, sequence_date)
		)`);
		const orderInfo = await db.execute("PRAGMA table_info(orders)");
		const orderColumns = new Set(orderInfo.rows.map((row: any) => String(row.name)));
		for (const [name, definition] of [
			["restaurant_table_id", "TEXT"], ["guest_count", "INTEGER NOT NULL DEFAULT 1"],
			["guest_count_specified", "INTEGER NOT NULL DEFAULT 0"],
			["opened_at", "TEXT"], ["closed_at", "TEXT"], ["version", "INTEGER NOT NULL DEFAULT 1"],
			["checkout_idempotency_key", "TEXT"], ["open_idempotency_key", "TEXT"], ["queue_no", "TEXT"], ["queue_date", "TEXT"],
			["fulfillment_status", "TEXT"], ["collected_at", "TEXT"], ["collected_by", "TEXT"],
		] as const) if (!orderColumns.has(name)) await db.execute(`ALTER TABLE orders ADD COLUMN ${name} ${definition}`);
		const roundInfo = await db.execute("PRAGMA table_info(restaurant_order_rounds)");
		const roundColumns = new Set(roundInfo.rows.map((row: any) => String(row.name)));
		if (!roundColumns.has("dispatch_mode")) await db.execute("ALTER TABLE restaurant_order_rounds ADD COLUMN dispatch_mode TEXT NOT NULL DEFAULT 'kitchen'");
		const itemInfo = await db.execute("PRAGMA table_info(order_items)");
		const itemColumns = new Set(itemInfo.rows.map((row: any) => String(row.name)));
		for (const [name, definition] of [
			["round_id", "TEXT"], ["line_status", "TEXT NOT NULL DEFAULT 'sent'"], ["note", "TEXT"],
			["sent_at", "TEXT"], ["cancelled_at", "TEXT"], ["cancelled_by", "TEXT"], ["cancel_reason", "TEXT"],
			["inventory_applied_at", "TEXT"], ["cost_source_at_sale", "TEXT NOT NULL DEFAULT 'purchase'"],
		] as const) if (!itemColumns.has(name)) await db.execute(`ALTER TABLE order_items ADD COLUMN ${name} ${definition}`);
		await db.execute("CREATE INDEX IF NOT EXISTS idx_restaurant_zones_store ON restaurant_zones(store_id, is_active, sort_order)");
		await db.execute("CREATE INDEX IF NOT EXISTS idx_restaurant_tables_store_zone ON restaurant_tables(store_id, zone_id, is_active, sort_order)");
		await db.execute("CREATE INDEX IF NOT EXISTS idx_restaurant_orders_table ON orders(store_id, restaurant_table_id, status)");
		await db.execute(`CREATE UNIQUE INDEX IF NOT EXISTS uq_restaurant_open_order_per_table
			ON orders(store_id, restaurant_table_id)
			WHERE restaurant_table_id IS NOT NULL AND status IN ('open','ready_to_pay')`);
		await db.execute(`CREATE UNIQUE INDEX IF NOT EXISTS uq_restaurant_checkout_idempotency
			ON orders(store_id, checkout_idempotency_key)
			WHERE checkout_idempotency_key IS NOT NULL`);
		await db.execute(`CREATE UNIQUE INDEX IF NOT EXISTS uq_restaurant_open_idempotency
			ON orders(store_id, open_idempotency_key)
			WHERE open_idempotency_key IS NOT NULL`);
		await db.execute(`CREATE UNIQUE INDEX IF NOT EXISTS uq_restaurant_queue_per_day
			ON orders(store_id, queue_date, queue_no)
			WHERE queue_date IS NOT NULL AND queue_no IS NOT NULL`);
		await db.execute("CREATE INDEX IF NOT EXISTS idx_restaurant_open_pickup ON orders(store_id, service_mode, status, opened_at)");
		await db.execute("CREATE INDEX IF NOT EXISTS idx_storefront_pickup_queue ON orders(store_id, fulfillment_status, paid_at)");
		await db.execute("CREATE INDEX IF NOT EXISTS idx_restaurant_items_order_status ON order_items(order_id, line_status)");
			RestaurantInterface.initialized = true;
		})().catch((error) => {
			RestaurantInterface.initializationPromise = null;
			throw error;
		});

		return RestaurantInterface.initializationPromise;
	}

	static async listPickupQueue(storeId: string): Promise<any[]> {
		await RestaurantInterface.ensureTables();
		const db = DbConn.getClient();
		const orders = await db.execute({ sql: `SELECT id,order_no,queue_no,total,payment_method,paid_at,created_at
			FROM orders WHERE store_id=? AND service_mode='pickup' AND payment_status='paid'
			AND fulfillment_status='waiting_pickup' ORDER BY COALESCE(paid_at,created_at),created_at`, args: [storeId] });
		if (!orders.rows.length) return [];
		const ids = orders.rows.map((row: any) => String(row.id));
		const items = await db.execute({ sql: `SELECT oi.order_id,oi.product_id,p.name,oi.qty,oi.line_total,oi.is_gift
			FROM order_items oi JOIN products p ON p.id=oi.product_id
			WHERE oi.order_id IN (${ids.map(() => "?").join(",")}) ORDER BY oi.rowid`, args: ids });
		const byOrder = new Map<string, any[]>();
		for (const item of items.rows as any[]) {
			const orderItems = byOrder.get(String(item.order_id)) || [];
			orderItems.push(item);
			byOrder.set(String(item.order_id), orderItems);
		}
		return (orders.rows as any[]).map((order) => ({ ...order, items: byOrder.get(String(order.id)) || [] }));
	}

	static async listPickupQueueHistory(storeId: string): Promise<any[]> {
		await RestaurantInterface.ensureTables();
		const db = DbConn.getClient();
		const orders = await db.execute({ sql: `SELECT o.id,o.order_no,o.queue_no,o.total,o.payment_method,o.paid_at,o.created_at,
			o.collected_at,o.collected_by,u.name AS collected_by_name
			FROM orders o LEFT JOIN users u ON CAST(u.id AS TEXT)=CAST(o.collected_by AS TEXT)
			WHERE o.store_id=? AND o.service_mode='pickup' AND o.payment_status='paid'
			AND o.fulfillment_status='collected' AND o.queue_date=?
			ORDER BY o.collected_at DESC,o.paid_at DESC`, args: [storeId, restaurantDate()] });
		if (!orders.rows.length) return [];
		const ids = orders.rows.map((row: any) => String(row.id));
		const items = await db.execute({ sql: `SELECT oi.order_id,oi.product_id,p.name,oi.qty,oi.line_total,oi.is_gift
			FROM order_items oi JOIN products p ON p.id=oi.product_id
			WHERE oi.order_id IN (${ids.map(() => "?").join(",")}) ORDER BY oi.rowid`, args: ids });
		const byOrder = new Map<string, any[]>();
		for (const item of items.rows as any[]) {
			const orderItems = byOrder.get(String(item.order_id)) || [];
			orderItems.push(item);
			byOrder.set(String(item.order_id), orderItems);
		}
		return (orders.rows as any[]).map((order) => ({ ...order, items: byOrder.get(String(order.id)) || [] }));
	}

	static async pickupQueueEnabled(storeId: string): Promise<boolean> {
		await RestaurantInterface.ensureTables();
		const result = await DbConn.getClient().execute({ sql: "SELECT pickup_queue_enabled FROM stores WHERE id=? LIMIT 1", args: [storeId] });
		return Number(result.rows[0]?.pickup_queue_enabled || 0) !== 0;
	}

	static async markPickupCollected(storeId: string, orderId: string, actorId: string): Promise<any> {
		await RestaurantInterface.ensureTables();
		const db = DbConn.getClient();
		const stamp = now();
		const result = await db.execute({ sql: `UPDATE orders SET fulfillment_status='collected',collected_at=?,collected_by=?
			WHERE id=? AND store_id=? AND service_mode='pickup' AND payment_status='paid' AND fulfillment_status='waiting_pickup'`, args: [stamp, actorId, orderId, storeId] });
		if (!result.rowsAffected) {
			const existing = await db.execute({ sql: "SELECT id,fulfillment_status,collected_at,collected_by FROM orders WHERE id=? AND store_id=?", args: [orderId, storeId] });
			if (!existing.rows[0]) throw ApiError.NotFoundError("queue order not found");
			if (String(existing.rows[0].fulfillment_status) !== "collected") throw conflict("order is not waiting for pickup");
			return existing.rows[0];
		}
		await RestaurantInterface.audit(db as Executor, storeId, actorId, "pos.pickup.collected", "order", orderId, { collected_at: stamp });
		return { id: orderId, fulfillment_status: "collected", collected_at: stamp, collected_by: actorId };
	}

	static async listZones(storeId: string): Promise<any[]> {
		await RestaurantInterface.ensureTables();
		const result = await DbConn.getClient().execute({ sql: `SELECT z.*,
			(SELECT COUNT(*) FROM restaurant_tables t WHERE t.zone_id=z.id) AS table_count
			FROM restaurant_zones z WHERE z.store_id=? ORDER BY z.sort_order, z.name`, args: [storeId] });
		return result.rows as any[];
	}

	static async saveZone(storeId: string, input: any, id?: string): Promise<any> {
		await RestaurantInterface.ensureTables();
		const name = text(input.name);
		if (!name) throw ApiError.BadRequestError("zone name is required");
		const db = DbConn.getClient();
		if(id&&(input.is_active===false||number(input.is_active)===0)){const occupied=await db.execute({sql:`SELECT 1 FROM orders o JOIN restaurant_tables t ON t.id=o.restaurant_table_id WHERE t.zone_id=? AND o.store_id=? AND o.status IN ('open','ready_to_pay') LIMIT 1`,args:[id,storeId]});if(occupied.rows.length)throw conflict("ไม่สามารถปิดโซนที่มีโต๊ะกำลังใช้งาน");}
		const stamp = now();
		try {
			if (id) await db.execute({ sql: "UPDATE restaurant_zones SET name=?, sort_order=?, is_active=?, updated_at=? WHERE id=? AND store_id=?", args: [name, number(input.sort_order), input.is_active === false || number(input.is_active) === 0 ? 0 : 1, stamp, id, storeId] });
			else { id = randomUUID(); await db.execute({ sql: "INSERT INTO restaurant_zones(id,store_id,name,sort_order,is_active,created_at,updated_at) VALUES(?,?,?,?,?,?,?)", args: [id, storeId, name, number(input.sort_order), 1, stamp, stamp] }); }
		} catch (error: any) { if (String(error?.message).includes("UNIQUE")) throw conflict("ชื่อโซนนี้มีอยู่แล้ว"); throw error; }
		const row = await db.execute({ sql: "SELECT * FROM restaurant_zones WHERE id=? AND store_id=?", args: [id, storeId] });
		if (!row.rows[0]) throw ApiError.NotFoundError("zone not found");
		return row.rows[0];
	}

	static async deleteZone(storeId: string, id: string): Promise<void> {
		await RestaurantInterface.ensureTables();
		const db = DbConn.getClient();
		const occupied = await db.execute({ sql: `SELECT 1 FROM orders o JOIN restaurant_tables t ON t.id=o.restaurant_table_id
			WHERE t.zone_id=? AND o.store_id=? AND o.status IN ('open','ready_to_pay') LIMIT 1`, args: [id, storeId] });
		if (occupied.rows.length) throw conflict("ไม่สามารถลบโซนที่มีโต๊ะกำลังใช้งาน");
		const tables = await db.execute({ sql: "SELECT 1 FROM restaurant_tables WHERE zone_id=? AND store_id=? LIMIT 1", args: [id, storeId] });
		if (tables.rows.length) throw conflict("กรุณาลบหรือย้ายโต๊ะในโซนก่อน");
		const result = await db.execute({ sql: "DELETE FROM restaurant_zones WHERE id=? AND store_id=?", args: [id, storeId] });
		if (!result.rowsAffected) throw ApiError.NotFoundError("zone not found");
	}

	static async listTables(storeId: string): Promise<any[]> {
		await RestaurantInterface.ensureTables();
		const result = await DbConn.getClient().execute({ sql: `SELECT t.*, z.name AS zone_name,
			o.id AS order_id, o.order_no, o.status AS order_status, o.total, o.guest_count, o.guest_count_specified, o.opened_at, o.version,
			COALESCE((SELECT COUNT(*) FROM order_items oi WHERE oi.order_id=o.id AND oi.line_status='draft'),0) AS draft_count
			FROM restaurant_tables t JOIN restaurant_zones z ON z.id=t.zone_id
			LEFT JOIN orders o ON o.restaurant_table_id=t.id AND o.status IN ('open','ready_to_pay')
			WHERE t.store_id=? ORDER BY z.sort_order, z.name, t.sort_order, t.name`, args: [storeId] });
		return result.rows as any[];
	}

	static async setMenuAvailability(storeId:string,productId:string,soldOut:boolean):Promise<any>{
		await RestaurantInterface.ensureTables();const db=DbConn.getClient();const result=await db.execute({sql:"UPDATE products SET manual_sold_out=?,updated_at=? WHERE id=? AND store_id=? AND inventory_mode='untracked' AND deleted_at IS NULL",args:[soldOut?1:0,now(),productId,storeId]});
		if(!result.rowsAffected)throw ApiError.BadRequestError("พบเฉพาะเมนูอาหารแบบไม่ติดตามสต็อกเท่านั้น");const row=await db.execute({sql:"SELECT id,name,manual_sold_out FROM products WHERE id=? AND store_id=?",args:[productId,storeId]});return row.rows[0];
	}

	static async profitability(storeId:string,from?:string):Promise<any>{
		await RestaurantInterface.ensureTables();const args:any[]=[storeId];let dateSql="";if(from){dateSql=" AND o.closed_at>=?";args.push(from);}
		const result=await DbConn.getClient().execute({sql:`SELECT
			COALESCE(SUM(CASE WHEN oi.is_gift=0 THEN oi.line_total ELSE 0 END),0) AS revenue,
			COALESCE(SUM(CASE WHEN oi.cost_source_at_sale IN ('purchase','manual') THEN oi.line_total ELSE 0 END),0) AS known_cost_revenue,
			COALESCE(SUM(CASE WHEN oi.cost_source_at_sale IN ('purchase','manual') THEN oi.cost_base_at_sale*oi.qty_base ELSE 0 END),0) AS known_cost,
			COALESCE(SUM(CASE WHEN oi.cost_source_at_sale='unknown' AND oi.is_gift=0 THEN oi.line_total ELSE 0 END),0) AS unknown_cost_revenue,
			COUNT(DISTINCT CASE WHEN oi.cost_source_at_sale='unknown' AND oi.is_gift=0 THEN o.id END) AS unknown_cost_bills,
			COUNT(DISTINCT o.id) AS bill_count
			FROM orders o JOIN order_items oi ON oi.order_id=o.id AND oi.line_status!='cancelled'
			WHERE o.store_id=? AND o.status='completed'${dateSql}`,args});const row=result.rows[0]||{};const knownRevenue=number(row.known_cost_revenue);const knownCost=number(row.known_cost);
		return{revenue:number(row.revenue),known_cost_revenue:knownRevenue,known_cost:knownCost,known_gross_profit:knownRevenue-knownCost,unknown_cost_revenue:number(row.unknown_cost_revenue),unknown_cost_bills:number(row.unknown_cost_bills),bill_count:number(row.bill_count)};
	}

	static async saveTable(storeId: string, input: any, id?: string): Promise<any> {
		await RestaurantInterface.ensureTables();
		const db = DbConn.getClient();
		const name = text(input.name); const zoneId = text(input.zone_id); const capacity = Math.max(1, Math.round(number(input.capacity) || 1));
		if (!name || !zoneId) throw ApiError.BadRequestError("table name and zone are required");
		const zone = await db.execute({ sql: "SELECT 1 FROM restaurant_zones WHERE id=? AND store_id=?", args: [zoneId, storeId] });
		if (!zone.rows.length) throw ApiError.BadRequestError("zone is invalid");
		if (id && (input.is_active === false || number(input.is_active) === 0)) {
			const occupied = await db.execute({ sql: "SELECT 1 FROM orders WHERE restaurant_table_id=? AND store_id=? AND status IN ('open','ready_to_pay') LIMIT 1", args: [id, storeId] });
			if (occupied.rows.length) throw conflict("ไม่สามารถปิดโต๊ะที่กำลังใช้งาน");
		}
		const stamp = now();
		try {
			if (id) await db.execute({ sql: "UPDATE restaurant_tables SET zone_id=?,name=?,code=?,capacity=?,sort_order=?,is_active=?,updated_at=? WHERE id=? AND store_id=?", args: [zoneId,name,text(input.code)||null,capacity,number(input.sort_order),input.is_active === false || number(input.is_active)===0?0:1,stamp,id,storeId] });
			else { id=randomUUID(); await db.execute({ sql: "INSERT INTO restaurant_tables(id,store_id,zone_id,name,code,capacity,sort_order,is_active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)", args: [id,storeId,zoneId,name,text(input.code)||null,capacity,number(input.sort_order),1,stamp,stamp] }); }
		} catch (error: any) { if (String(error?.message).includes("UNIQUE")) throw conflict("ชื่อโต๊ะนี้มีอยู่ในโซนแล้ว"); throw error; }
		const row = await db.execute({ sql: "SELECT * FROM restaurant_tables WHERE id=? AND store_id=?", args: [id,storeId] });
		if (!row.rows[0]) throw ApiError.NotFoundError("table not found");
		return row.rows[0];
	}

	static async deleteTable(storeId: string, id: string): Promise<void> {
		await RestaurantInterface.ensureTables(); const db=DbConn.getClient();
		const occupied=await db.execute({sql:"SELECT 1 FROM orders WHERE restaurant_table_id=? AND store_id=? AND status IN ('open','ready_to_pay') LIMIT 1",args:[id,storeId]});
		if(occupied.rows.length) throw conflict("ไม่สามารถลบโต๊ะที่กำลังใช้งาน");
		const result=await db.execute({sql:"DELETE FROM restaurant_tables WHERE id=? AND store_id=?",args:[id,storeId]});
		if(!result.rowsAffected) throw ApiError.NotFoundError("table not found");
	}

	private static async allocateQueue(executor: Executor, storeId: string): Promise<{ queueNo: string; queueDate: string }> {
		return allocateRestaurantQueue(executor, storeId);
	}

	private static async insertDraftItem(executor: Executor, storeId: string, orderId: string, input: any): Promise<void> {
		const product = await executor.execute({
			sql: "SELECT * FROM products WHERE id=? AND store_id=? AND deleted_at IS NULL AND active=1",
			args: [text(input.product_id), storeId],
		});
		const row = product.rows[0];
		if (!row || number(row.manual_sold_out)) throw ApiError.BadRequestError("product is unavailable");
		const qty = Math.max(1, Math.round(number(input.qty) || 1));
		await executor.execute({
			sql: `INSERT INTO order_items(id,order_id,product_id,unit_id,qty,qty_base,price_base_at_sale,cost_base_at_sale,line_total,is_gift,promotion_id,line_status,note,cost_source_at_sale)
				VALUES(?,?,?,?,?,?,?,?,?,0,NULL,'draft',?,?)`,
			args: [randomUUID(), orderId, String(row.id), String(row.base_unit_id), qty, qty, number(row.price_base), number(row.cost_base), number(row.price_base) * qty, text(input.note) || null, String(row.cost_source || "purchase")],
		});
	}

	static async createOrder(storeId: string, input: any, actorId: string): Promise<any> {
		await RestaurantInterface.ensureTables();
		const db = DbConn.getClient();
		const serviceMode = input.service_mode === "pickup" ? "pickup" : "dine-in";
		const tableId = serviceMode === "dine-in" ? text(input.table_id) : "";
		const idempotencyKey = text(input.idempotency_key);
		if (serviceMode === "pickup" && !idempotencyKey) throw ApiError.BadRequestError("Idempotency-Key is required for pickup order");
		if (idempotencyKey) {
			const previous = await db.execute({ sql: "SELECT id FROM orders WHERE store_id=? AND open_idempotency_key=? LIMIT 1", args: [storeId, idempotencyKey] });
			if (previous.rows[0]) return RestaurantInterface.getOrder(storeId, String(previous.rows[0].id));
		}
		const tx = await db.transaction("write");
		try {
			const store = await tx.execute({ sql: "SELECT currency,store_type,pickup_queue_enabled FROM stores WHERE id=?", args: [storeId] });
			if (!store.rows[0]) throw ApiError.NotFoundError("store not found");
			if (String(store.rows[0].store_type) !== "RESTAURANT") throw ApiError.BadRequestError("restaurant order is only available for RESTAURANT stores");
			let queueNo: string | null = null;
			let queueDate: string | null = null;
			if (serviceMode === "dine-in") {
				if (!tableId) throw ApiError.BadRequestError("table_id is required for dine-in");
				const table = await tx.execute({ sql: "SELECT 1 FROM restaurant_tables WHERE id=? AND store_id=? AND is_active=1", args: [tableId, storeId] });
				if (!table.rows.length) throw ApiError.NotFoundError("table not found");
				const existing = await tx.execute({ sql: "SELECT id FROM orders WHERE store_id=? AND restaurant_table_id=? AND status IN ('open','ready_to_pay') LIMIT 1", args: [storeId, tableId] });
				if (existing.rows.length) {
					if (input.initial_item) throw conflict("โต๊ะนี้มีออเดอร์เปิดอยู่แล้ว");
					await tx.rollback();
					return RestaurantInterface.getOrder(storeId, String(existing.rows[0].id));
				}
			} else if (Number(store.rows[0].pickup_queue_enabled) !== 0) {
				const queue = await RestaurantInterface.allocateQueue(tx, storeId);
				queueNo = queue.queueNo;
				queueDate = queue.queueDate;
			}

			const stamp = now();
			const id = randomUUID();
			const orderNo = `RES-${stamp.slice(0, 10).replace(/-/g, "")}-${id.slice(0, 6).toUpperCase()}`;
			const guestSpecified = input.guest_count !== undefined && input.guest_count !== null && text(input.guest_count) !== "";
			await tx.execute({
				sql: `INSERT INTO orders(id,store_id,order_no,channel,status,subtotal,discount,vat_amount,shipping_fee_charged,total,shipping_cost,created_by,created_at,payment_currency,payment_method,payment_status,service_mode,amount_tendered,change_amount,restaurant_table_id,guest_count,guest_count_specified,opened_at,version,queue_no,queue_date,open_idempotency_key)
					VALUES(?,?,?,'restaurant','open',0,0,0,0,0,0,?,?,?,'','unpaid',?,0,0,?,?,?,?,1,?,?,?)`,
				args: [id, storeId, orderNo, actorId, stamp, String(store.rows[0].currency || "LAK"), serviceMode, tableId || null, Math.max(1, Math.round(number(input.guest_count) || 1)), guestSpecified ? 1 : 0, stamp, queueNo, queueDate, idempotencyKey || null],
			});
			if (input.initial_item) {
				await RestaurantInterface.insertDraftItem(tx, storeId, id, input.initial_item);
				await RestaurantInterface.syncAutomaticPromotions(tx, storeId, id);
				await RestaurantInterface.recalculate(tx, id);
			}
			await RestaurantInterface.audit(tx, storeId, actorId, "pos.restaurant.open", "order", id, { service_mode: serviceMode, table_id: tableId || null, queue_no: queueNo });
			await tx.commit();
			return RestaurantInterface.getOrder(storeId, id);
		} catch (error) {
			if (!tx.closed) await tx.rollback().catch(() => undefined);
			throw error;
		} finally {
			tx.close();
		}
	}

	private static async assertVersion(executor: Executor, storeId: string, orderId: string, expectedVersion: number): Promise<any> {
		const result=await executor.execute({sql:"SELECT * FROM orders WHERE id=? AND store_id=? AND status IN ('open','ready_to_pay')",args:[orderId,storeId]});
		const order=result.rows[0]; if(!order) throw ApiError.NotFoundError("open restaurant order not found");
		if(number(order.version)!==expectedVersion) throw conflict("ออเดอร์ถูกแก้ไขจากอีกเครื่อง กรุณาโหลดใหม่"); return order;
	}

	private static orderReadStatements(storeId:string,orderId:string):any[]{
		const stamp = now();
		return [
			{sql:`SELECT o.*,t.name AS table_name,t.code AS table_code,z.name AS zone_name FROM orders o
				LEFT JOIN restaurant_tables t ON t.id=o.restaurant_table_id LEFT JOIN restaurant_zones z ON z.id=t.zone_id WHERE o.id=? AND o.store_id=?`,args:[orderId,storeId]},
			{sql:`SELECT oi.*,p.name,p.sku,p.inventory_mode,p.manual_sold_out,r.round_no
				FROM order_items oi JOIN products p ON p.id=oi.product_id LEFT JOIN restaurant_order_rounds r ON r.id=oi.round_id
				WHERE oi.order_id=? ORDER BY CASE WHEN oi.line_status='draft' THEN 0 ELSE 1 END,r.round_no,oi.id`,args:[orderId]},
			{sql:"SELECT * FROM restaurant_order_rounds WHERE order_id=? ORDER BY round_no",args:[orderId]},
			{sql:"SELECT product_id,SUM(qty) qty,SUM(line_total) amount FROM order_items WHERE order_id=? AND line_status!='cancelled' AND is_gift=0 GROUP BY product_id",args:[orderId]},
			{sql:`SELECT p.*,gp.name gift_product_name FROM promotions p JOIN products gp ON gp.id=p.gift_product_id WHERE p.store_id=? AND p.is_active=1 AND p.deleted_at IS NULL AND (p.starts_at IS NULL OR p.starts_at<=?) AND (p.ends_at IS NULL OR p.ends_at>=?)`,args:[storeId,stamp,stamp]},
			{sql:"SELECT promotion_id,SUM(qty) qty FROM order_items WHERE order_id=? AND line_status!='cancelled' AND is_gift=1 GROUP BY promotion_id",args:[orderId]},
		];
	}

	private static mapOrderResults(results:any[]):any{
		const [order,items,rounds,promotionLines,promotions,gifts]=results;
		if(!order.rows[0]) throw ApiError.NotFoundError("restaurant order not found");
		return {...order.rows[0],items:items.rows,rounds:rounds.rows,promotions:RestaurantInterface.mapPromotionState(promotionLines,promotions,gifts)};
	}

	static async getOrder(storeId:string,orderId:string):Promise<any>{
		await RestaurantInterface.ensureTables(); const db=DbConn.getClient();
		return RestaurantInterface.mapOrderResults(await db.batch(RestaurantInterface.orderReadStatements(storeId,orderId),"read"));
	}

	static async listOpenOrders(storeId: string): Promise<any[]> {
		await RestaurantInterface.ensureTables();
		const result = await DbConn.getClient().execute({
			sql: `SELECT o.id,o.order_no,o.service_mode,o.queue_no,o.status,o.total,o.guest_count,o.guest_count_specified,o.opened_at,o.version,
				t.name AS table_name,z.name AS zone_name,
				COALESCE(SUM(CASE WHEN oi.line_status='draft' THEN 1 ELSE 0 END),0) AS draft_count,
				COALESCE(SUM(CASE WHEN oi.line_status='sent' THEN 1 ELSE 0 END),0) AS sent_count
				FROM orders o
				LEFT JOIN restaurant_tables t ON t.id=o.restaurant_table_id
				LEFT JOIN restaurant_zones z ON z.id=t.zone_id
				LEFT JOIN order_items oi ON oi.order_id=o.id
				WHERE o.store_id=? AND o.service_mode='dine-in' AND o.status IN ('open','ready_to_pay')
					AND (o.channel='restaurant' OR o.restaurant_table_id IS NOT NULL)
				GROUP BY o.id,t.name,z.name
				ORDER BY o.opened_at`,
			args: [storeId],
		});
		return result.rows as any[];
	}

	static async changeServiceMode(storeId: string, orderId: string, input: any, actorId: string): Promise<any> {
		await RestaurantInterface.ensureTables();
		const db = DbConn.getClient();
		const tx = await db.transaction("write");
		try {
			const order = await RestaurantInterface.assertVersion(tx, storeId, orderId, number(input.expected_version));
			const serviceMode = input.service_mode === "pickup" ? "pickup" : "dine-in";
			let tableId: string | null = null;
			let queueNo = order.queue_no ? String(order.queue_no) : null;
			let queueDate = order.queue_date ? String(order.queue_date) : null;
			if (serviceMode === "dine-in") {
				tableId = text(input.table_id);
				if (!tableId) throw ApiError.BadRequestError("table_id is required for dine-in");
				const table = await tx.execute({ sql: "SELECT 1 FROM restaurant_tables WHERE id=? AND store_id=? AND is_active=1", args: [tableId, storeId] });
				if (!table.rows.length) throw ApiError.NotFoundError("table not found");
				const occupied = await tx.execute({ sql: "SELECT 1 FROM orders WHERE restaurant_table_id=? AND store_id=? AND id!=? AND status IN ('open','ready_to_pay') LIMIT 1", args: [tableId, storeId, orderId] });
				if (occupied.rows.length) throw conflict("โต๊ะปลายทางกำลังใช้งาน");
			} else if (!queueNo && await RestaurantInterface.pickupQueueEnabled(storeId)) {
				const queue = await RestaurantInterface.allocateQueue(tx, storeId);
				queueNo = queue.queueNo;
				queueDate = queue.queueDate;
			}
			const guestSpecified = input.guest_count !== undefined && input.guest_count !== null && text(input.guest_count) !== "";
			await tx.execute({
				sql: "UPDATE orders SET service_mode=?,restaurant_table_id=?,guest_count=?,guest_count_specified=?,queue_no=?,queue_date=?,version=version+1 WHERE id=?",
				args: [serviceMode, tableId, Math.max(1, Math.round(number(input.guest_count) || number(order.guest_count) || 1)), guestSpecified ? 1 : 0, queueNo, queueDate, orderId],
			});
			await RestaurantInterface.audit(tx, storeId, actorId, "pos.restaurant.change_service_mode", "order", orderId, { from: order.service_mode, to: serviceMode, table_id: tableId, queue_no: queueNo });
			await tx.commit();
			return RestaurantInterface.getOrder(storeId, orderId);
		} catch (error) {
			if (!tx.closed) await tx.rollback().catch(() => undefined);
			throw error;
		} finally {
			tx.close();
		}
	}

	static async cancelOrder(storeId: string, orderId: string, input: any, actorId: string, allowSent: boolean): Promise<any> {
		await RestaurantInterface.ensureTables();
		const db = DbConn.getClient();
		const tx = await db.transaction("write");
		try {
			await RestaurantInterface.assertVersion(tx, storeId, orderId, number(input.expected_version));
			const sent = await tx.execute({ sql: "SELECT COUNT(*) AS total FROM order_items WHERE order_id=? AND line_status='sent'", args: [orderId] });
			if (number(sent.rows[0]?.total) > 0 && !allowSent) throw ApiError.ForbiddenError("Manager permission is required to cancel an order already sent to kitchen");
			const reason = text(input.reason) || (number(sent.rows[0]?.total) > 0 ? "" : "ยกเลิกก่อนส่งครัว");
			if (number(sent.rows[0]?.total) > 0 && !reason) throw ApiError.BadRequestError("cancel reason is required");
			const stamp = now();
			await tx.execute({ sql: "UPDATE order_items SET line_status='cancelled',cancelled_at=?,cancelled_by=?,cancel_reason=? WHERE order_id=? AND line_status IN ('draft','sent')", args: [stamp, actorId, reason, orderId] });
			await tx.execute({ sql: "UPDATE orders SET status='cancelled',closed_at=?,version=version+1 WHERE id=?", args: [stamp, orderId] });
			await RestaurantInterface.audit(tx, storeId, actorId, "pos.restaurant.cancel_order", "order", orderId, { reason, had_sent_items: number(sent.rows[0]?.total) > 0 });
			await tx.commit();
			return RestaurantInterface.getOrder(storeId, orderId);
		} catch (error) {
			if (!tx.closed) await tx.rollback().catch(() => undefined);
			throw error;
		} finally {
			tx.close();
		}
	}

	private static recalculateStatement(orderId:string,versionIncrement=1):any{return {sql:`WITH totals AS (
				SELECT COALESCE(SUM(oi.line_total),0) subtotal,s.vat_enabled,
					CASE WHEN s.vat_rate>100 THEN s.vat_rate/100.0 ELSE s.vat_rate END vat_rate,
					UPPER(s.vat_mode) vat_mode
				FROM orders o JOIN stores s ON s.id=o.store_id
				LEFT JOIN order_items oi ON oi.order_id=o.id AND oi.line_status!='cancelled'
				WHERE o.id=? GROUP BY o.id,s.vat_enabled,s.vat_rate,s.vat_mode
			), calculated AS (
				SELECT subtotal,
					CASE WHEN vat_enabled THEN ROUND(CASE WHEN vat_mode='INCLUSIVE' THEN subtotal*vat_rate/(100+vat_rate) ELSE subtotal*vat_rate/100 END) ELSE 0 END vat,
					vat_mode FROM totals
			)
			UPDATE orders SET
				subtotal=COALESCE((SELECT subtotal FROM calculated),0),
				vat_amount=COALESCE((SELECT vat FROM calculated),0),
				total=COALESCE((SELECT CASE WHEN vat_mode='INCLUSIVE' THEN subtotal ELSE subtotal+vat END FROM calculated),0),
				version=version+?
			WHERE id=?`,args:[orderId,versionIncrement,orderId]};}

	private static async recalculate(executor:Executor,orderId:string,versionIncrement=1):Promise<void>{
		await executor.execute(RestaurantInterface.recalculateStatement(orderId,versionIncrement));
	}

	static async addItem(storeId:string,orderId:string,input:any,actorId:string):Promise<any>{
		void actorId;
		await RestaurantInterface.ensureTables();
		const db=DbConn.getClient();
		const expectedVersion = number(input.expected_version);
		const qty = Math.max(1, Math.round(number(input.qty) || 1));
		const itemId = randomUUID();
		const stamp = now();
		const [inserted, recalculated, order, items, rounds, promotionLines, promotions, gifts, automatic] = await db.batch([
			{
				sql: `INSERT INTO order_items(id,order_id,product_id,unit_id,qty,qty_base,price_base_at_sale,cost_base_at_sale,line_total,is_gift,promotion_id,line_status,note,cost_source_at_sale)
					SELECT ?,o.id,p.id,p.base_unit_id,?,?,p.price_base,p.cost_base,p.price_base*?,0,NULL,'draft',?,COALESCE(p.cost_source,'purchase')
					FROM orders o JOIN products p ON p.id=? AND p.store_id=o.store_id
					WHERE o.id=? AND o.store_id=? AND o.status IN ('open','ready_to_pay') AND o.version=?
						AND p.deleted_at IS NULL AND p.active=1 AND COALESCE(p.manual_sold_out,0)=0`,
				args: [itemId,qty,qty,qty,text(input.note)||null,text(input.product_id),orderId,storeId,expectedVersion],
			},
			{
				sql: `WITH totals AS (
						SELECT COALESCE(SUM(oi.line_total),0) subtotal,s.vat_enabled,
							CASE WHEN s.vat_rate>100 THEN s.vat_rate/100 ELSE s.vat_rate END vat_rate,
							UPPER(s.vat_mode) vat_mode
						FROM orders o JOIN stores s ON s.id=o.store_id
						LEFT JOIN order_items oi ON oi.order_id=o.id AND oi.line_status!='cancelled'
						WHERE o.id=? GROUP BY o.id,s.vat_enabled,s.vat_rate,s.vat_mode
					), calculated AS (
						SELECT subtotal,vat_mode,CASE WHEN vat_enabled!=0 THEN ROUND(
							CASE WHEN vat_mode='INCLUSIVE' THEN subtotal*vat_rate/(100+vat_rate) ELSE subtotal*vat_rate/100 END
						) ELSE 0 END vat FROM totals
					)
					UPDATE orders SET
						subtotal=(SELECT subtotal FROM calculated),
						vat_amount=(SELECT vat FROM calculated),
						total=(SELECT CASE WHEN vat_mode='INCLUSIVE' THEN subtotal ELSE subtotal+vat END FROM calculated),
						version=version+1
					WHERE id=? AND store_id=? AND version=? AND EXISTS(SELECT 1 FROM order_items WHERE id=?)`,
				args: [orderId,orderId,storeId,expectedVersion,itemId],
			},
			{sql:`SELECT o.*,t.name AS table_name,t.code AS table_code,z.name AS zone_name FROM orders o
				LEFT JOIN restaurant_tables t ON t.id=o.restaurant_table_id LEFT JOIN restaurant_zones z ON z.id=t.zone_id WHERE o.id=? AND o.store_id=?`,args:[orderId,storeId]},
			{sql:`SELECT oi.*,p.name,p.sku,p.inventory_mode,p.manual_sold_out,r.round_no
				FROM order_items oi JOIN products p ON p.id=oi.product_id LEFT JOIN restaurant_order_rounds r ON r.id=oi.round_id
				WHERE oi.order_id=? ORDER BY CASE WHEN oi.line_status='draft' THEN 0 ELSE 1 END,r.round_no,oi.id`,args:[orderId]},
			{sql:"SELECT * FROM restaurant_order_rounds WHERE order_id=? ORDER BY round_no",args:[orderId]},
			{sql:"SELECT product_id,SUM(qty) qty,SUM(line_total) amount FROM order_items WHERE order_id=? AND line_status!='cancelled' AND is_gift=0 GROUP BY product_id",args:[orderId]},
			{sql:`SELECT p.*,gp.name gift_product_name FROM promotions p JOIN products gp ON gp.id=p.gift_product_id WHERE p.store_id=? AND p.is_active=1 AND p.deleted_at IS NULL AND (p.starts_at IS NULL OR p.starts_at<=?) AND (p.ends_at IS NULL OR p.ends_at>=?)`,args:[storeId,stamp,stamp]},
			{sql:"SELECT promotion_id,SUM(qty) qty FROM order_items WHERE order_id=? AND line_status!='cancelled' AND is_gift=1 GROUP BY promotion_id",args:[orderId]},
			{sql:"SELECT 1 FROM promotions WHERE store_id=? AND is_active=1 AND deleted_at IS NULL AND apply_mode='automatic' LIMIT 1",args:[storeId]},
		], "write");
		if (!inserted.rowsAffected || !recalculated.rowsAffected) {
			throw conflict("ออเดอร์ถูกแก้ไข สินค้าไม่พร้อมขาย หรือไม่พบสินค้า กรุณาโหลดใหม่");
		}
		if (automatic.rows.length) {
			const tx = await db.transaction("write");
			try {
				await RestaurantInterface.syncAutomaticPromotions(tx,storeId,orderId);
				await RestaurantInterface.recalculate(tx,orderId);
				await tx.commit();
			} catch (error) {
				if (!tx.closed) await tx.rollback().catch(() => undefined);
				throw error;
			} finally { tx.close(); }
			return RestaurantInterface.getOrder(storeId,orderId);
		}
		if (!order.rows[0]) throw ApiError.NotFoundError("restaurant order not found");
		return {
			...order.rows[0],
			items: items.rows,
			rounds: rounds.rows,
			promotions: RestaurantInterface.mapPromotionState(promotionLines,promotions,gifts),
		};
	}

	static async updateItem(storeId:string,orderId:string,itemId:string,input:any):Promise<any>{
		await RestaurantInterface.ensureTables();const db=DbConn.getClient();const tx=await db.transaction("write");try{await RestaurantInterface.assertVersion(tx,storeId,orderId,number(input.expected_version));
			const qty=Math.round(number(input.qty));if(qty<=0)throw ApiError.BadRequestError("quantity must be positive");
			const result=await tx.execute({sql:"UPDATE order_items SET qty=?,qty_base=?,line_total=price_base_at_sale*?,note=? WHERE id=? AND order_id=? AND line_status='draft' AND is_gift=0",args:[qty,qty,qty,text(input.note)||null,itemId,orderId]});
			if(!result.rowsAffected)throw conflict("แก้ได้เฉพาะรายการที่ยังไม่ส่งครัว");await RestaurantInterface.syncAutomaticPromotions(tx,storeId,orderId);await RestaurantInterface.recalculate(tx,orderId);await tx.commit();return RestaurantInterface.getOrder(storeId,orderId);
		}catch(error){if(!tx.closed)await tx.rollback().catch(()=>undefined);throw error;}finally{tx.close();}}

	static async deleteItem(storeId:string,orderId:string,itemId:string,expectedVersion:number):Promise<any>{
		await RestaurantInterface.ensureTables();const db=DbConn.getClient();const tx=await db.transaction("write");try{await RestaurantInterface.assertVersion(tx,storeId,orderId,expectedVersion);
			const result=await tx.execute({sql:"DELETE FROM order_items WHERE id=? AND order_id=? AND line_status='draft'",args:[itemId,orderId]});if(!result.rowsAffected)throw conflict("ลบได้เฉพาะรายการที่ยังไม่ส่งครัว");
			await RestaurantInterface.syncAutomaticPromotions(tx,storeId,orderId);await RestaurantInterface.recalculate(tx,orderId);await tx.commit();return RestaurantInterface.getOrder(storeId,orderId);
		}catch(error){if(!tx.closed)await tx.rollback().catch(()=>undefined);throw error;}finally{tx.close();}}

	static async cancelSentItem(storeId:string,orderId:string,itemId:string,input:any,actorId:string):Promise<any>{
		await RestaurantInterface.ensureTables();const reason=text(input.reason)||null;const db=DbConn.getClient();const tx=await db.transaction("write");try{await RestaurantInterface.assertVersion(tx,storeId,orderId,number(input.expected_version));
			const found=await tx.execute({sql:"SELECT qty,is_gift FROM order_items WHERE id=? AND order_id=? AND line_status='sent' LIMIT 1",args:[itemId,orderId]});const item=found.rows[0];if(!item)throw conflict("แก้ไขได้เฉพาะรายการที่บันทึกแล้ว");if(number(item.is_gift))throw conflict("ไม่สามารถแก้จำนวนของแถมจากรายการนี้ได้");
			const previousQty=Math.round(number(item.qty));const nextQty=input.qty===undefined?0:Math.round(number(input.qty));if(nextQty<0||nextQty>=previousQty)throw ApiError.BadRequestError("new quantity must be lower than current quantity");
			if(nextQty===0)await tx.execute({sql:"UPDATE order_items SET line_status='cancelled',cancelled_at=?,cancelled_by=?,cancel_reason=? WHERE id=? AND order_id=? AND line_status='sent'",args:[now(),actorId,reason,itemId,orderId]});
			else await tx.execute({sql:"UPDATE order_items SET qty=?,qty_base=?,line_total=price_base_at_sale*? WHERE id=? AND order_id=? AND line_status='sent'",args:[nextQty,nextQty,nextQty,itemId,orderId]});
			const invalid=(await RestaurantInterface.promotionState(tx,storeId,orderId)).find((promotion:any)=>promotion.over_granted_qty>0);if(invalid)throw conflict(`รายการนี้ทำให้สิทธิ์ ${invalid.name} หาย กรุณาให้ Manager จัดการของแถมก่อน`);
			await RestaurantInterface.audit(tx,storeId,actorId,nextQty===0?"pos.restaurant.cancel_sent":"pos.restaurant.adjust_sent_quantity","order_item",itemId,{order_id:orderId,previous_qty:previousQty,new_qty:nextQty,reason});
			await RestaurantInterface.recalculate(tx,orderId);await tx.commit();return RestaurantInterface.getOrder(storeId,orderId);
		}catch(error){if(!tx.closed)await tx.rollback().catch(()=>undefined);throw error;}finally{tx.close();}}

	private static async dispatchDraftItems(executor: Executor, storeId: string, orderId: string, idempotencyKey: string, actorId: string, dispatchMode: "kitchen" | "direct", options: { syncAutomatic?: boolean; recalculateVersionIncrement?: number; returnOrder?: boolean } = {}): Promise<{ roundId: string; roundNo: number; order?: any }> {
		if (options.syncAutomatic !== false) await RestaurantInterface.syncAutomaticPromotions(executor, storeId, orderId);
		const reads = [
			{sql: `SELECT oi.*,p.name,p.inventory_mode,p.active,p.manual_sold_out,
				COALESCE(b.on_hand_base,0) on_hand_base,COALESCE(b.reserved_base,0) reserved_base
				FROM order_items oi JOIN products p ON p.id=oi.product_id
				LEFT JOIN inventory_balances b ON b.store_id=? AND b.product_id=p.id
				WHERE oi.order_id=? AND oi.line_status='draft'`,
			args: [storeId, orderId]},
			{sql: "SELECT COALESCE(MAX(round_no),0)+1 next_no FROM restaurant_order_rounds WHERE order_id=?", args: [orderId]},
		];
		const [draft, roundResult] = executor.batch
			? await executor.batch(reads)
			: await Promise.all(reads.map((statement) => executor.execute(statement)));
		if (!draft.rows.length) throw ApiError.BadRequestError("ไม่มีรายการใหม่สำหรับดำเนินการ");
		const roundNo = number(roundResult.rows[0]?.next_no) || 1;
		const roundId = randomUUID();
		const stamp = now();
		const writes: any[] = [{
			sql: "INSERT INTO restaurant_order_rounds(id,order_id,round_no,sent_by,sent_at,idempotency_key,dispatch_mode) VALUES(?,?,?,?,?,?,?)",
			args: [roundId, orderId, roundNo, actorId, stamp, idempotencyKey, dispatchMode],
		}];
		const consumed = new Map<string, number>();
		for (const row of draft.rows as any[]) {
			if (!number(row.active) || number(row.manual_sold_out)) throw ApiError.BadRequestError(`${row.name} is unavailable`);
			if (String(row.inventory_mode || "tracked") === "tracked") {
				const used = consumed.get(String(row.product_id)) || 0;
				const available = number(row.on_hand_base) - number(row.reserved_base) - used;
				if (available < number(row.qty_base)) throw ApiError.BadRequestError(`${row.name} has insufficient stock`);
				const nextOnHand = number(row.on_hand_base) - used - number(row.qty_base);
				const reserved = number(row.reserved_base);
				writes.push({
					sql: `INSERT INTO inventory_balances(store_id,product_id,on_hand_base,reserved_base,available_base,updated_at) VALUES(?,?,?,?,?,?)
						ON CONFLICT(store_id,product_id) DO UPDATE SET on_hand_base=excluded.on_hand_base,available_base=excluded.available_base,updated_at=excluded.updated_at`,
					args: [storeId, row.product_id, nextOnHand, reserved, nextOnHand - reserved, stamp],
				});
				writes.push({
					sql: "INSERT INTO inventory_movements(id,store_id,product_id,type,qty_base,ref_type,ref_id,note,created_by,created_at) VALUES(?,?,?,'SALE_OUT',?,'restaurant_round',?,?,?,?)",
					args: [randomUUID(), storeId, row.product_id, -number(row.qty_base), roundId, row.note || null, actorId, stamp],
				});
				consumed.set(String(row.product_id), used + number(row.qty_base));
			}
			writes.push({
				sql: "UPDATE order_items SET round_id=?,line_status='sent',sent_at=?,inventory_applied_at=? WHERE id=?",
				args: [roundId, stamp, String(row.inventory_mode || "tracked") === "tracked" ? stamp : null, row.id],
			});
		}
		if (options.recalculateVersionIncrement) writes.push(RestaurantInterface.recalculateStatement(orderId, options.recalculateVersionIncrement));
		const readStatements=options.returnOrder?RestaurantInterface.orderReadStatements(storeId,orderId):[];
		const statements=[...writes,...readStatements];
		let results:any[];
		if(executor.batch)results=await executor.batch(statements);
		else{results=[];for(const statement of statements)results.push(await executor.execute(statement));}
		const order=readStatements.length?RestaurantInterface.mapOrderResults(results.slice(-readStatements.length)):undefined;
		return { roundId, roundNo, order };
	}

	private static draftItemStatements(storeId: string, orderId: string, items: any[], guard?: { expectedVersion: number; idempotencyKey: string }): any[] {
		const merged = new Map<string, { product_id: string; qty: number; note: string | null; is_gift: boolean; promotion_id: string | null }>();
		for (const raw of items) {
			const productId = text(raw?.product_id);
			const qty = Math.round(number(raw?.qty));
			const note = text(raw?.note) || null;
			const isGift = Boolean(raw?.is_gift);
			const promotionId = isGift ? text(raw?.promotion_id) || null : null;
			if (!productId || qty <= 0) throw ApiError.BadRequestError("invalid draft item");
			const key = `${productId}:${note || ""}:${isGift ? promotionId || "gift" : "paid"}`;
			const previous = merged.get(key);
			merged.set(key, { product_id: productId, qty: (previous?.qty || 0) + qty, note, is_gift: isGift, promotion_id: promotionId });
		}
		return [...merged.values()].map((item) => ({
				sql: `INSERT INTO order_items(id,order_id,product_id,unit_id,qty,qty_base,price_base_at_sale,cost_base_at_sale,line_total,is_gift,promotion_id,line_status,note,cost_source_at_sale)
					SELECT ?,o.id,p.id,p.base_unit_id,?,?,CASE WHEN ? THEN 0 ELSE p.price_base END,p.cost_base,CASE WHEN ? THEN 0 ELSE p.price_base*? END,?,?, 'draft',?,COALESCE(p.cost_source,'purchase')
					FROM orders o JOIN products p ON p.id=? AND p.store_id=o.store_id
					WHERE o.id=? AND o.store_id=? AND o.status IN ('open','ready_to_pay')
						${guard ? "AND o.version=? AND NOT EXISTS(SELECT 1 FROM restaurant_order_rounds WHERE order_id=o.id AND idempotency_key=?)" : ""}
						AND p.deleted_at IS NULL AND p.active=1 AND COALESCE(p.manual_sold_out,0)=0`,
				args: [randomUUID(), item.qty, item.qty, item.is_gift ? 1 : 0, item.is_gift ? 1 : 0, item.qty, item.is_gift ? 1 : 0, item.promotion_id, item.note, item.product_id, orderId, storeId, ...(guard ? [guard.expectedVersion, guard.idempotencyKey] : [])],
			}));
	}

	private static async insertBatchDraftItems(executor: Executor, storeId: string, orderId: string, items: any[]): Promise<void> {
		const statements = RestaurantInterface.draftItemStatements(storeId, orderId, items);
		const results = executor.batch
			? await executor.batch(statements)
			: await Promise.all(statements.map((statement) => executor.execute(statement)));
		if (results.some((result) => !result.rowsAffected)) throw ApiError.BadRequestError("สินค้าไม่พร้อมขาย หรือไม่พบสินค้า");
	}

	static async sendRound(storeId:string,orderId:string,expectedVersion:number,idempotencyKey:string,actorId:string,items: any[] = []):Promise<any>{
		if(!idempotencyKey)throw ApiError.BadRequestError("Idempotency-Key is required");await RestaurantInterface.ensureTables();const db=DbConn.getClient();const tx=await db.transaction("write");
		try{const itemStatements=items.length?RestaurantInterface.draftItemStatements(storeId,orderId,items,{expectedVersion,idempotencyKey}):[];
			const [previous,current,automatic,...inserted]=await tx.batch([
			{sql:"SELECT * FROM restaurant_order_rounds WHERE order_id=? AND idempotency_key=?",args:[orderId,idempotencyKey]},
			{sql:"SELECT * FROM orders WHERE id=? AND store_id=? AND status IN ('open','ready_to_pay')",args:[orderId,storeId]},
			{sql:"SELECT 1 FROM promotions WHERE store_id=? AND is_active=1 AND deleted_at IS NULL AND apply_mode='automatic' LIMIT 1",args:[storeId]},
			...itemStatements,
		]);
			if(previous.rows[0]){await tx.rollback();return RestaurantInterface.getOrder(storeId,orderId);}
			const activeOrder=current.rows[0];if(!activeOrder)throw ApiError.NotFoundError("open restaurant order not found");
			if(number(activeOrder.version)!==expectedVersion)throw conflict("ออเดอร์ถูกแก้ไขจากอีกเครื่อง กรุณาโหลดใหม่");
			if(inserted.some((result)=>!result.rowsAffected))throw ApiError.BadRequestError("สินค้าไม่พร้อมขาย หรือไม่พบสินค้า");
			if (automatic.rows.length) await RestaurantInterface.syncAutomaticPromotions(tx,storeId,orderId,true);
			const round=await RestaurantInterface.dispatchDraftItems(tx,storeId,orderId,idempotencyKey,actorId,"kitchen",{syncAutomatic:false,recalculateVersionIncrement:2,returnOrder:true});
			await tx.commit();
			RestaurantInterface.auditAsync(storeId,actorId,"pos.restaurant.send_kitchen","order",orderId,{round_id:round.roundId,round_no:round.roundNo,idempotency_key:idempotencyKey});
			return round.order;
		}catch(error){if(!tx.closed)await tx.rollback().catch(()=>undefined);throw error;}finally{tx.close();}}

	static async transfer(storeId:string,orderId:string,targetTableId:string,expectedVersion:number,actorId:string):Promise<any>{await RestaurantInterface.ensureTables();const db=DbConn.getClient();const tx=await db.transaction("write");try{const order=await RestaurantInterface.assertVersion(tx,storeId,orderId,expectedVersion);
		const target=await tx.execute({sql:"SELECT 1 FROM restaurant_tables WHERE id=? AND store_id=? AND is_active=1",args:[targetTableId,storeId]});if(!target.rows.length)throw ApiError.NotFoundError("target table not found");const occupied=await tx.execute({sql:"SELECT 1 FROM orders WHERE restaurant_table_id=? AND store_id=? AND status IN ('open','ready_to_pay') LIMIT 1",args:[targetTableId,storeId]});if(occupied.rows.length)throw conflict("โต๊ะปลายทางกำลังใช้งาน");
		await tx.execute({sql:"UPDATE orders SET restaurant_table_id=?,version=version+1 WHERE id=?",args:[targetTableId,orderId]});await RestaurantInterface.audit(tx,storeId,actorId,"pos.restaurant.transfer","order",orderId,{from_table_id:String(order.restaurant_table_id||""),to_table_id:targetTableId});await tx.commit();return RestaurantInterface.getOrder(storeId,orderId);}catch(error){if(!tx.closed)await tx.rollback().catch(()=>undefined);throw error;}finally{tx.close();}}

	static async markReady(storeId:string,orderId:string,expectedVersion:number):Promise<any>{await RestaurantInterface.ensureTables();const db=DbConn.getClient();const result=await db.execute({sql:"UPDATE orders SET status='ready_to_pay',version=version+1 WHERE id=? AND store_id=? AND version=? AND status='open'",args:[orderId,storeId,expectedVersion]});if(!result.rowsAffected)throw conflict("ออเดอร์ถูกแก้ไขหรือไม่อยู่ในสถานะเปิด");return RestaurantInterface.getOrder(storeId,orderId);}

	private static mapPromotionState(lines:any,promos:any,gifts:any):any[]{
		const qty=new Map<string,number>(lines.rows.map((r:any)=>[String(r.product_id),number(r.qty)]));const subtotal=lines.rows.reduce((s:number,r:any)=>s+number(r.amount),0);const giftQty=new Map<string,number>(gifts.rows.map((r:any)=>[String(r.promotion_id),number(r.qty)]));
		return promos.rows.map((p:any)=>{const current=qty.get(String(p.qualifying_product_id))||0;const rawApplications=String(p.type)==="buy_x_get_y"?Math.floor(current/Math.max(1,number(p.qualifying_qty))):Math.floor(subtotal/Math.max(1,number(p.minimum_subtotal)));const limit=number(p.max_applications_per_bill);const applications=limit>0?Math.min(rawApplications,limit):rawApplications;const earned=applications*number(p.gift_qty);const granted=giftQty.get(String(p.id))||0;const available=Math.max(0,earned-granted);return{promotion_id:String(p.id),name:String(p.name),apply_mode:String(p.apply_mode||"manual"),gift_product_id:String(p.gift_product_id),gift_product_name:String(p.gift_product_name),gift_qty:available,earned_gift_qty:earned,granted_gift_qty:granted,over_granted_qty:Math.max(0,granted-earned),applications,eligible:available>0,remaining_qty:String(p.type)==="buy_x_get_y"&&rawApplications===0?Math.max(0,number(p.qualifying_qty)-current):0,remaining_amount:String(p.type)==="cart_total_gift"&&rawApplications===0?Math.max(0,number(p.minimum_subtotal)-subtotal):0};});
	}

	private static async promotionState(executor:Executor,storeId:string,orderId:string):Promise<any[]>{
		const stamp=now();
		const statements = [
			{sql:"SELECT product_id,SUM(qty) qty,SUM(line_total) amount FROM order_items WHERE order_id=? AND line_status!='cancelled' AND is_gift=0 GROUP BY product_id",args:[orderId]},
			{sql:`SELECT p.*,gp.name gift_product_name FROM promotions p JOIN products gp ON gp.id=p.gift_product_id WHERE p.store_id=? AND p.is_active=1 AND p.deleted_at IS NULL AND (p.starts_at IS NULL OR p.starts_at<=?) AND (p.ends_at IS NULL OR p.ends_at>=?)`,args:[storeId,stamp,stamp]},
			{sql:"SELECT promotion_id,SUM(qty) qty FROM order_items WHERE order_id=? AND line_status!='cancelled' AND is_gift=1 GROUP BY promotion_id",args:[orderId]},
		];
		const [lines, promos, gifts] = executor.batch
			? await executor.batch(statements)
			: await Promise.all(statements.map((statement) => executor.execute(statement)));
		return RestaurantInterface.mapPromotionState(lines,promos,gifts);
	}

	private static async syncAutomaticPromotions(executor:Executor,storeId:string,orderId:string,knownEnabled=false):Promise<void>{
		const checks = [
			{sql:"SELECT 1 FROM promotions WHERE store_id=? AND is_active=1 AND deleted_at IS NULL AND apply_mode='automatic' LIMIT 1",args:[storeId]},
			{sql:"DELETE FROM order_items WHERE order_id=? AND line_status='draft' AND is_gift=1 AND promotion_id IN (SELECT id FROM promotions WHERE store_id=? AND is_active=1 AND deleted_at IS NULL AND apply_mode='automatic')",args:[orderId,storeId]},
		];
		const results = knownEnabled
			? [null, await executor.execute(checks[1])]
			: executor.batch
				? await executor.batch(checks)
				: await Promise.all(checks.map((statement) => executor.execute(statement)));
		const automatic = results[0];
		if (!knownEnabled && !automatic?.rows.length) return;
		const states=await RestaurantInterface.promotionState(executor,storeId,orderId);
		const eligible=states.filter((p:any)=>p.apply_mode==="automatic"&&p.eligible);
		if (!eligible.length) return;
		const productStatements=eligible.map((state:any)=>({sql:"SELECT * FROM products WHERE id=? AND store_id=? AND active=1",args:[state.gift_product_id,storeId]}));
		const products=executor.batch
			? await executor.batch(productStatements)
			: await Promise.all(productStatements.map((statement) => executor.execute(statement)));
		const inserts=eligible.flatMap((state:any,index:number)=>{const p=products[index]?.rows[0];if(!p||number(p.manual_sold_out))return[];return[{sql:`INSERT INTO order_items(id,order_id,product_id,unit_id,qty,qty_base,price_base_at_sale,cost_base_at_sale,line_total,is_gift,promotion_id,line_status,cost_source_at_sale)
			VALUES(?,?,?,?,?,?,0,?,0,1,?,'draft',?)`,args:[randomUUID(),orderId,p.id,p.base_unit_id,state.gift_qty,state.gift_qty,number(p.cost_base),state.promotion_id,String(p.cost_source||"purchase")]}];});
		if (inserts.length) {
			if (executor.batch) await executor.batch(inserts);
			else await Promise.all(inserts.map((statement) => executor.execute(statement)));
		}
	}

	static async applyPromotion(storeId:string,orderId:string,promotionId:string,expectedVersion:number):Promise<any>{await RestaurantInterface.ensureTables();const db=DbConn.getClient();const tx=await db.transaction("write");try{await RestaurantInterface.assertVersion(tx,storeId,orderId,expectedVersion);const state=(await RestaurantInterface.promotionState(tx,storeId,orderId)).find((p:any)=>p.promotion_id===promotionId);if(!state||!state.eligible)throw ApiError.BadRequestError("promotion is not eligible");
		if(state.apply_mode!=="manual")throw ApiError.BadRequestError("automatic promotion cannot be applied manually");
		const product=await tx.execute({sql:"SELECT * FROM products WHERE id=? AND store_id=? AND active=1",args:[state.gift_product_id,storeId]});const p=product.rows[0];if(!p||number(p.manual_sold_out))throw ApiError.BadRequestError("gift product is unavailable");
		await tx.execute({sql:`INSERT INTO order_items(id,order_id,product_id,unit_id,qty,qty_base,price_base_at_sale,cost_base_at_sale,line_total,is_gift,promotion_id,line_status,cost_source_at_sale) VALUES(?,?,?,?,?,?,0,?,0,1,?,'draft',?)`,args:[randomUUID(),orderId,p.id,p.base_unit_id,state.gift_qty,state.gift_qty,number(p.cost_base),promotionId,String(p.cost_source||"purchase")]});await RestaurantInterface.recalculate(tx,orderId);await tx.commit();return RestaurantInterface.getOrder(storeId,orderId);}catch(error){if(!tx.closed)await tx.rollback().catch(()=>undefined);throw error;}finally{tx.close();}}

	static async checkout(storeId:string,orderId:string,input:any,actorId:string,idempotencyKey:string):Promise<any>{if(!idempotencyKey)throw ApiError.BadRequestError("Idempotency-Key is required");await RestaurantInterface.ensureTables();const db=DbConn.getClient();
		const previous=await db.execute({sql:"SELECT id FROM orders WHERE store_id=? AND checkout_idempotency_key=? LIMIT 1",args:[storeId,idempotencyKey]});if(previous.rows[0])return RestaurantInterface.getOrder(storeId,String(previous.rows[0].id));
		const tx=await db.transaction("write");try{const order=await RestaurantInterface.assertVersion(tx,storeId,orderId,number(input.expected_version));const draft=await tx.execute({sql:"SELECT 1 FROM order_items WHERE order_id=? AND line_status='draft' LIMIT 1",args:[orderId]});
		let directRound:null|{roundId:string;roundNo:number}=null;
		if(draft.rows.length&&input.dispatch_mode==="direct")directRound=await RestaurantInterface.dispatchDraftItems(tx,storeId,orderId,`direct:${idempotencyKey}`,actorId,"direct");
		else if(draft.rows.length)throw conflict("กรุณาส่งครัวก่อนชำระเงิน หรือเลือกชำระและจบเลย");
		const invalid=(await RestaurantInterface.promotionState(tx,storeId,orderId)).find((promotion:any)=>promotion.over_granted_qty>0);if(invalid)throw conflict(`โปรโมชั่น ${invalid.name} มีของแถมเกินสิทธิ์ กรุณาให้ Manager ตรวจสอบ`);
		const store=(await tx.execute({sql:"SELECT currency,vat_enabled,vat_rate,vat_mode FROM stores WHERE id=?",args:[storeId]})).rows[0];const subtotal=number(order.subtotal);const rawRate=number(store?.vat_rate);const rate=rawRate>100?rawRate/100:rawRate;const vat=number(store?.vat_enabled)?Math.round(String(store?.vat_mode).toUpperCase()==="INCLUSIVE"?subtotal*rate/(100+rate):subtotal*rate/100):0;const total=String(store?.vat_mode).toUpperCase()==="INCLUSIVE"?subtotal:subtotal+vat;const method=text(input.payment_method);const tendered=method==="cash"?number(input.amount_tendered):total;if(tendered<total)throw ApiError.BadRequestError("amount_tendered is less than total");const stamp=now();
		await tx.execute({sql:`UPDATE orders SET status='completed',payment_status='paid',payment_method=?,subtotal=?,vat_amount=?,total=?,amount_tendered=?,change_amount=?,paid_at=?,closed_at=?,checkout_idempotency_key=?,version=version+1 WHERE id=?`,args:[method,subtotal,vat,total,tendered,tendered-total,stamp,stamp,idempotencyKey,orderId]});
		await tx.execute({sql:`INSERT INTO cash_flow_entries(id,store_id,account_id,direction,entry_type,source_type,source_id,amount,currency,reference,note,metadata,occurred_at,created_by,created_at) VALUES(?,?,NULL,'in','sale','order',?,?,?,?,?,?,?, ?,?)`,args:[randomUUID(),storeId,orderId,total,String(store?.currency||"LAK"),text(input.payment_reference)||null,text(input.note)||null,JSON.stringify({payment_method:method,idempotency_key:idempotencyKey,dispatch_mode:input.dispatch_mode||"existing"}),stamp,actorId,stamp]});
		await tx.commit();
		if(directRound)RestaurantInterface.auditAsync(storeId,actorId,"pos.restaurant.dispatch_direct","order",orderId,{round_id:directRound.roundId,round_no:directRound.roundNo});
		RestaurantInterface.auditAsync(storeId,actorId,"pos.restaurant.checkout","order",orderId,{payment_method:method,total,idempotency_key:idempotencyKey,dispatch_mode:input.dispatch_mode||"existing"});
		return RestaurantInterface.getOrder(storeId,orderId);
	}catch(error){if(!tx.closed)await tx.rollback().catch(()=>undefined);throw error;}finally{tx.close();}}
}
