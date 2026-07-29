import { createHash, randomUUID } from "crypto";

import { InValue } from "@libsql/client";

import { DbConn } from "@connections/DbConn";
import { PromotionInterface } from "@interfaces/PromotionInterface";
import { ApiError } from "@middlewares/ApiError";
import { allocateRestaurantQueue } from "@utils/RestaurantQueue";

export type PosPaymentMethod = "cash" | "qr_transfer" | "credit_card";

export type PosCheckoutPayload = {
	store_id: string;
	service_mode: "walk-in" | "pickup" | "delivery";
	payment_method: PosPaymentMethod;
	items: Array<{ product_id: string; qty: number }>;
	promotion_ids?: string[];
	amount_tendered?: number | null;
	payment_account_id?: string | null;
	payment_reference?: string | null;
	payment_slip_url?: string | null;
	note?: string | null;
	idempotency_key: string;
	created_by: string;
	request_id?: string | null;
	timing?: (name: string, durationMs: number) => void;
};

export type CheckoutReceiptLine = {
	product_id: string;
	name: string;
	sku: string;
	qty: number;
	unit_price: number;
	line_total: number;
	is_gift: boolean;
	promotion_id: string | null;
};

export type CheckoutResult = {
	order_id: string;
	order_no: string;
	subtotal: number;
	discount: number;
	vat_amount: number;
	total: number;
	payment_method: PosPaymentMethod;
	amount_tendered: number;
	change_amount: number;
	completed_at: string;
	queue_no: string | null;
	queue_date: string | null;
	receipt: {
		lines: CheckoutReceiptLine[];
		promotions: Array<{ promotion_id: string; name: string; gift_product_id: string; gift_qty: number }>;
	};
};

export type OrderListFilters = {
	storeId: string;
	query?: string;
	status?: string;
	channel?: string;
	paymentStatus?: string;
	paymentMethod?: string;
	from?: string;
	to?: string;
};

const ALLOWED_METHODS = new Set<PosPaymentMethod>([ "cash", "qr_transfer", "credit_card" ]);
const ALLOWED_MODES = new Set([ "walk-in", "pickup", "delivery" ]);

function json(value: unknown): string {
	return JSON.stringify(value ?? {});
}

export class OrderInterface {
	private static initialized = false;
	private static initializationPromise: Promise<void> | null = null;
	private static orderListSchema: { hasRestaurantTables: boolean; hasLineStatus: boolean } | null = null;

	static async ensureTables(): Promise<void> {
		if (OrderInterface.initialized) return;
		if (OrderInterface.initializationPromise) return OrderInterface.initializationPromise;

		OrderInterface.initializationPromise = (async () => {
			const db = DbConn.getClient();
			const info = await db.execute("PRAGMA table_info(orders)");
		const columns = new Set(info.rows.map((row) => String((row as Record<string, unknown>).name)));
		for (const [ name, definition ] of [
			[ "service_mode", "TEXT NOT NULL DEFAULT 'walk-in'" ],
			[ "amount_tendered", "REAL NOT NULL DEFAULT 0" ],
			[ "change_amount", "REAL NOT NULL DEFAULT 0" ],
			[ "payment_reference", "TEXT" ],
			[ "note", "TEXT" ],
			[ "queue_no", "TEXT" ],
			[ "queue_date", "TEXT" ],
			[ "fulfillment_status", "TEXT" ],
			[ "collected_at", "TEXT" ],
			[ "collected_by", "TEXT" ],
		] as const) {
			if (!columns.has(name)) await db.execute(`ALTER TABLE orders ADD COLUMN ${name} ${definition}`);
		}
		await db.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_store_order_no ON orders (store_id, order_no)");
		await db.execute("CREATE INDEX IF NOT EXISTS idx_orders_store_created ON orders (store_id, created_at DESC)");
		await db.execute("CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items (order_id)");
		await db.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_idempotency_store_action_key ON idempotency_requests (store_id, action, idempotency_key)");
		await db.execute(`CREATE TABLE IF NOT EXISTS restaurant_daily_sequences (
			store_id TEXT NOT NULL, sequence_date TEXT NOT NULL, last_queue_no INTEGER NOT NULL DEFAULT 0,
			PRIMARY KEY(store_id, sequence_date)
		)`);
		await db.execute(`CREATE UNIQUE INDEX IF NOT EXISTS uq_restaurant_queue_per_day
			ON orders(store_id, queue_date, queue_no) WHERE queue_date IS NOT NULL AND queue_no IS NOT NULL`);
			OrderInterface.initialized = true;
		})().catch((error) => {
			OrderInterface.initializationPromise = null;
			throw error;
		});

		return OrderInterface.initializationPromise;
	}

	static async checkout(payload: PosCheckoutPayload): Promise<CheckoutResult> {
		const startedAt = performance.now();
		const mark = (name: string, since: number) => payload.timing?.(name, performance.now() - since);
		await OrderInterface.ensureTables();
		await PromotionInterface.ensureTables();
		if (!payload.store_id.trim()) throw ApiError.BadRequestError("store_id is required");
		if (!ALLOWED_METHODS.has(payload.payment_method)) throw ApiError.BadRequestError("payment_method is invalid");
		if (!ALLOWED_MODES.has(payload.service_mode)) throw ApiError.BadRequestError("service_mode is invalid");
		if (!payload.idempotency_key.trim()) throw ApiError.BadRequestError("Idempotency-Key is required");
		if (!Array.isArray(payload.items) || !payload.items.length) throw ApiError.BadRequestError("cart is empty");

		const merged = new Map<string, number>();
		for (const item of payload.items) {
			const productId = String(item.product_id || "").trim();
			const qty = Number(item.qty);
			if (!productId || !Number.isFinite(qty) || qty <= 0 || !Number.isInteger(qty)) {
				throw ApiError.BadRequestError("each item requires product_id and a positive integer qty");
			}
			merged.set(productId, (merged.get(productId) || 0) + qty);
		}

		const requestHash = createHash("sha256").update(json({ ...payload, request_id: undefined, timing: undefined })).digest("hex");
		const db = DbConn.getClient();
		const transaction = await db.transaction("write");
		try {
			const catalogStartedAt = performance.now();
			const ids = [ ...merged.keys() ];
			const catalogStatements: Array<{ sql: string; args: InValue[] }> = [ {
				sql: "SELECT request_hash, status, response_body FROM idempotency_requests WHERE store_id = ? AND action = 'pos.checkout' AND idempotency_key = ? LIMIT 1",
				args: [ payload.store_id, payload.idempotency_key ],
			}, {
				sql: "SELECT currency, vat_enabled, vat_rate, vat_mode, allow_negative_stock, store_type, pickup_queue_enabled FROM stores WHERE id = ? LIMIT 1",
				args: [ payload.store_id ],
			}, {
				sql: `SELECT p.id, p.sku, p.name, p.base_unit_id, p.price_base, p.cost_base, p.active,
					COALESCE(ib.on_hand_base, 0) AS on_hand_base, COALESCE(ib.reserved_base, 0) AS reserved_base
					FROM products p LEFT JOIN inventory_balances ib ON ib.store_id = p.store_id AND ib.product_id = p.id
					WHERE p.store_id = ? AND p.id IN (${ids.map(() => "?").join(",")})`,
				args: [ payload.store_id, ...ids ],
			} ];
			const paymentAccountId = payload.payment_method === "qr_transfer" ? String(payload.payment_account_id || "").trim() : null;
			if (payload.payment_method === "qr_transfer") {
				if (!paymentAccountId) throw ApiError.BadRequestError("payment_account_id is required for QR / transfer");
				catalogStatements.push({
					sql: "SELECT id FROM store_payment_accounts WHERE id = ? AND store_id = ? AND is_active = 1 LIMIT 1",
					args: [ paymentAccountId, payload.store_id ],
				});
			}
			const [ previousResult, storeResult, productsResult, accountResult ] = await transaction.batch(catalogStatements);
			const previousRow = previousResult.rows[0] as Record<string, unknown> | undefined;
			if (previousRow) {
				if (String(previousRow.request_hash) !== requestHash) throw ApiError.BadRequestError("Idempotency-Key was already used with different data");
				if (String(previousRow.status) === "completed" && previousRow.response_body) {
					await transaction.rollback();
					return JSON.parse(String(previousRow.response_body)) as CheckoutResult;
				}
				throw ApiError.BadRequestError("checkout with this Idempotency-Key is already processing");
			}
			const store = storeResult.rows[0] as Record<string, unknown> | undefined;
			if (!store) throw ApiError.NotFoundError("store not found");
			if (productsResult.rows.length !== ids.length) throw ApiError.BadRequestError("some products were not found in this store");
			if (payload.payment_method === "qr_transfer" && !accountResult?.rows.length) throw ApiError.BadRequestError("payment account is invalid or inactive");
			mark("checkout-catalog", catalogStartedAt);

			const lines = productsResult.rows.map((raw) => {
				const row = raw as Record<string, unknown>;
				const qty = merged.get(String(row.id)) || 0;
				const available = Number(row.on_hand_base) - Number(row.reserved_base);
				if (!Number(row.active)) throw ApiError.BadRequestError(`${String(row.name)} is inactive`);
				if (!Number(store.allow_negative_stock) && available < qty) throw ApiError.BadRequestError(`${String(row.name)} has insufficient stock`);
				const price = Number(row.price_base || 0);
				return { row, qty, lineTotal: price * qty };
			});
			const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
			const promotionStartedAt = performance.now();
			const appliedPromotions = await PromotionInterface.evaluate(payload.store_id, lines.map((line) => ({ product_id: String(line.row.id), qty: line.qty })), payload.promotion_ids, transaction as never);
			const giftProductIds = [ ...new Set(appliedPromotions.map((promotion) => promotion.gift_product_id)) ];
			if (giftProductIds.length) {
				const gifts = await transaction.execute({
					sql: `SELECT p.id, p.name, p.base_unit_id, p.price_base, p.cost_base, p.active, COALESCE(ib.on_hand_base, 0) AS on_hand_base, COALESCE(ib.reserved_base, 0) AS reserved_base
						FROM products p LEFT JOIN inventory_balances ib ON ib.store_id=p.store_id AND ib.product_id=p.id WHERE p.store_id=? AND p.id IN (${giftProductIds.map(() => "?").join(",")})`,
					args: [ payload.store_id, ...giftProductIds ],
				});
				const giftRows = new Map(gifts.rows.map((row: any) => [ String(row.id), row as Record<string, unknown> ]));
				for (const promotion of appliedPromotions) {
					const row = giftRows.get(promotion.gift_product_id);
					if (!row || !Number(row.active)) throw ApiError.BadRequestError(`gift product for ${promotion.name} is unavailable`);
					lines.push({ row, qty: promotion.gift_qty, lineTotal: 0, isGift: true, promotionId: promotion.promotion_id } as typeof lines[number] & { isGift: boolean; promotionId: string });
				}
			}
			mark("checkout-promotion", promotionStartedAt);
			const rawRate = Number(store.vat_rate || 0);
			const rate = rawRate > 100 ? rawRate / 100 : rawRate;
			const vatAmount = Number(store.vat_enabled)
				? Math.round(String(store.vat_mode).toUpperCase() === "INCLUSIVE" ? subtotal * rate / (100 + rate) : subtotal * rate / 100)
				: 0;
			const total = String(store.vat_mode).toUpperCase() === "INCLUSIVE" ? subtotal : subtotal + vatAmount;
			const amountTendered = payload.payment_method === "cash" ? Number(payload.amount_tendered) : total;
			if (!Number.isFinite(amountTendered) || amountTendered < total) throw ApiError.BadRequestError("amount_tendered is less than total");

			const now = new Date().toISOString();
			const orderId = randomUUID();
			const orderNo = `POS-${now.slice(0, 10).replace(/-/g, "")}-${orderId.slice(0, 6).toUpperCase()}`;
			const queue = String(store.store_type) === "RESTAURANT"
				&& payload.service_mode === "pickup"
				&& Number(store.pickup_queue_enabled) !== 0
				? await allocateRestaurantQueue(transaction, payload.store_id)
				: { queueNo: null, queueDate: null };
			const result: CheckoutResult = {
				order_id: orderId, order_no: orderNo, subtotal, discount: 0, vat_amount: vatAmount, total,
				payment_method: payload.payment_method, amount_tendered: amountTendered,
				change_amount: amountTendered - total, completed_at: now, queue_no: queue.queueNo, queue_date: queue.queueDate,
				receipt: {
					lines: lines.map((line: any) => ({
						product_id: String(line.row.id), name: String(line.row.name), sku: String(line.row.sku || ""), qty: line.qty,
						unit_price: line.isGift ? 0 : Number(line.row.price_base || 0), line_total: line.lineTotal,
						is_gift: Boolean(line.isGift), promotion_id: line.promotionId || null,
					})),
					promotions: appliedPromotions.map((promotion) => ({ promotion_id: promotion.promotion_id, name: promotion.name, gift_product_id: promotion.gift_product_id, gift_qty: promotion.gift_qty })),
				},
			};

			const writesStartedAt = performance.now();
			const writeStatements: Array<{ sql: string; args: InValue[] }> = [ {
				sql: `INSERT INTO idempotency_requests (id, store_id, action, idempotency_key, request_hash, status, created_by, created_at)
					VALUES (?, ?, 'pos.checkout', ?, ?, 'processing', ?, ?)`,
				args: [ randomUUID(), payload.store_id, payload.idempotency_key, requestHash, payload.created_by, now ],
			}, {
				sql: `INSERT INTO orders (id, store_id, order_no, channel, status, subtotal, discount, vat_amount,
					shipping_fee_charged, total, shipping_cost, paid_at, created_by, created_at, payment_currency,
					payment_method, payment_account_id, payment_slip_url, payment_proof_submitted_at, payment_status,
					service_mode, amount_tendered, change_amount, payment_reference, note, queue_no, queue_date, fulfillment_status)
					VALUES (?, ?, ?, ?, 'completed', ?, 0, ?, 0, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, 'paid', ?, ?, ?, ?, ?, ?, ?, ?)`,
				args: [ orderId, payload.store_id, orderNo, payload.service_mode, subtotal, vatAmount, total, now,
					payload.created_by, now, String(store.currency || "LAK"), payload.payment_method, paymentAccountId,
					payload.payment_slip_url || null, payload.payment_slip_url ? now : null, payload.service_mode,
					amountTendered, amountTendered - total, payload.payment_reference || null, payload.note || null, queue.queueNo, queue.queueDate,
					Number(store.pickup_queue_enabled) && payload.service_mode === "pickup" ? "waiting_pickup" : null ],
			} ];
			for (const promotion of appliedPromotions) {
				writeStatements.push({ sql: `INSERT INTO order_promotions (id, order_id, promotion_id, promotion_name, promotion_type, applications, gift_product_id, gift_qty, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, args: [ randomUUID(), orderId, promotion.promotion_id, promotion.name, promotion.type, promotion.applications, promotion.gift_product_id, promotion.gift_qty, now ] });
			}

			const consumedByProduct = new Map<string, number>();
			for (const line of lines) {
				const productId = String(line.row.id);
				const consumed = consumedByProduct.get(productId) || 0;
				const available = Number(line.row.on_hand_base) - Number(line.row.reserved_base) - consumed;
				if (!Number(store.allow_negative_stock) && available < line.qty) throw ApiError.BadRequestError(`${String(line.row.name)} has insufficient stock`);
				writeStatements.push({
					sql: `INSERT INTO order_items (id, order_id, product_id, unit_id, qty, qty_base, price_base_at_sale, cost_base_at_sale, line_total, is_gift, promotion_id)
						VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
					args: [ randomUUID(), orderId, productId, String(line.row.base_unit_id), line.qty, line.qty,
						(line as any).isGift ? 0 : Number(line.row.price_base || 0), Number(line.row.cost_base || 0), line.lineTotal, (line as any).isGift ? 1 : 0, (line as any).promotionId || null ],
				});
				const nextOnHand = Number(line.row.on_hand_base) - consumed - line.qty;
				const reserved = Number(line.row.reserved_base);
				writeStatements.push({
					sql: `INSERT INTO inventory_balances (store_id, product_id, on_hand_base, reserved_base, available_base, updated_at)
						VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(store_id, product_id) DO UPDATE SET
						on_hand_base=excluded.on_hand_base, available_base=excluded.available_base, updated_at=excluded.updated_at`,
					args: [ payload.store_id, productId, nextOnHand, reserved, nextOnHand - reserved, now ],
				});
				consumedByProduct.set(productId, consumed + line.qty);
				writeStatements.push({
					sql: `INSERT INTO inventory_movements (id, store_id, product_id, type, qty_base, ref_type, ref_id, note, created_by, created_at)
						VALUES (?, ?, ?, 'SALE_OUT', ?, 'order', ?, ?, ?, ?)`,
					args: [ randomUUID(), payload.store_id, productId, -line.qty, orderId, payload.note || null, payload.created_by, now ],
				});
			}

				writeStatements.push({
					sql: `INSERT INTO cash_flow_entries (id, store_id, account_id, direction, entry_type, source_type, source_id,
						amount, currency, reference, note, metadata, occurred_at, created_by, created_at)
						VALUES (?, ?, NULL, 'in', 'sale', 'order', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
					args: [ randomUUID(), payload.store_id, orderId, total, String(store.currency || "LAK"),
						payload.payment_reference || null, payload.note || null, json({ payment_method: payload.payment_method, amount_tendered: amountTendered, change_amount: amountTendered - total }), now, payload.created_by, now ],
				});
			writeStatements.push({
				sql: `UPDATE idempotency_requests SET status='completed', response_status=201, response_body=?, completed_at=?
					WHERE store_id=? AND action='pos.checkout' AND idempotency_key=?`,
				args: [ json(result), now, payload.store_id, payload.idempotency_key ],
			});
			await transaction.batch(writeStatements);
			await transaction.commit();
			void db.execute({
				sql: `INSERT INTO audit_events (id, scope, store_id, actor_user_id, actor_role, action, entity_type, entity_id, result, request_id, metadata, occurred_at)
					VALUES (?, 'store', ?, ?, 'cashier', 'pos.checkout', 'order', ?, 'success', ?, ?, ?)`,
				args: [ randomUUID(), payload.store_id, payload.created_by, orderId, payload.request_id || null, json(result), now ],
			}).catch((error) => console.error("[audit] pos.checkout failed", error));
			mark("checkout-writes", writesStartedAt);
			mark("checkout-total", startedAt);
			return result;
		} catch (error) {
			if (!transaction.closed) await transaction.rollback().catch(() => undefined);
			throw error;
		} finally {
			transaction.close();
		}
	}

	static async list(filters: OrderListFilters): Promise<Record<string, unknown>[]> {
		await OrderInterface.ensureTables();
		const db = DbConn.getClient();
		if (!OrderInterface.orderListSchema) {
			const [ tableCheck, itemInfo ] = await db.batch([
				"SELECT name FROM sqlite_master WHERE type='table' AND name='restaurant_tables'",
				"PRAGMA table_info(order_items)",
			], "read");
			OrderInterface.orderListSchema = {
				hasRestaurantTables: tableCheck.rows.length > 0,
				hasLineStatus: itemInfo.rows.some((row) => String(row.name) === "line_status"),
			};
		}
		const { hasRestaurantTables, hasLineStatus } = OrderInterface.orderListSchema;
		const restaurantSelect = hasRestaurantTables
			? ", t.name AS restaurant_table_name, z.name AS restaurant_zone_name"
			: ", NULL AS restaurant_table_name, NULL AS restaurant_zone_name";
		const restaurantJoins = hasRestaurantTables
			? " LEFT JOIN restaurant_tables t ON t.id=o.restaurant_table_id LEFT JOIN restaurant_zones z ON z.id=t.zone_id"
			: "";
		const where = [ "o.store_id = ?" ];
		const args: InValue[] = [ filters.storeId ];
		if (filters.query) { where.push("(LOWER(o.order_no) LIKE ? OR LOWER(COALESCE(o.customer_name,'')) LIKE ? OR LOWER(COALESCE(u.name,'')) LIKE ?)"); const q = `%${filters.query.toLowerCase()}%`; args.push(q, q, q); }
		if (filters.status && filters.status !== "all") { where.push("o.status = ?"); args.push(filters.status); }
		if (filters.channel && filters.channel !== "all") { where.push("o.channel = ?"); args.push(filters.channel); }
		if (filters.paymentStatus && filters.paymentStatus !== "all") { where.push("o.payment_status = ?"); args.push(filters.paymentStatus); }
		if (filters.paymentMethod && filters.paymentMethod !== "all") { where.push("o.payment_method = ?"); args.push(filters.paymentMethod); }
		if (filters.from) { where.push("o.created_at >= ?"); args.push(filters.from); }
		if (filters.to) { where.push("o.created_at <= ?"); args.push(filters.to); }
		const result = await db.execute({
			sql: `SELECT o.*, COALESCE(u.name, 'ผู้ใช้งาน') AS cashier_name,
				COALESCE(SUM(${hasLineStatus ? "CASE WHEN COALESCE(oi.line_status,'sent')!='cancelled' THEN oi.qty ELSE 0 END" : "oi.qty"}), 0) AS item_count${restaurantSelect}
				FROM orders o LEFT JOIN users u ON u.id = o.created_by LEFT JOIN order_items oi ON oi.order_id = o.id${restaurantJoins}
				WHERE ${where.join(" AND ")} GROUP BY o.id ORDER BY o.created_at DESC LIMIT 500`,
			args,
		});
		const orders: Array<Record<string, unknown> & { lines: Record<string, unknown>[] }> = result.rows.map((row) => ({ ...(row as Record<string, unknown>), lines: [] }));
		if (!orders.length) return orders;
		const orderIds = orders.map((order) => String(order.id));
		const itemResult = await db.execute({
			sql: `SELECT oi.*, p.name, p.sku${hasRestaurantTables ? ", r.round_no, r.dispatch_mode" : ", NULL AS round_no, NULL AS dispatch_mode"}
				FROM order_items oi JOIN products p ON p.id = oi.product_id${hasRestaurantTables ? " LEFT JOIN restaurant_order_rounds r ON r.id=oi.round_id" : ""}
				WHERE oi.order_id IN (${orderIds.map(() => "?").join(",")}) ORDER BY oi.id`,
			args: orderIds,
		});
		const byOrder = new Map<string, Record<string, unknown>[]>();
		for (const raw of itemResult.rows) { const row = raw as Record<string, unknown>; const list = byOrder.get(String(row.order_id)) || []; list.push(row); byOrder.set(String(row.order_id), list); }
		return orders.map((order) => ({ ...order, lines: byOrder.get(String(order.id)) || [] }));
	}
}
