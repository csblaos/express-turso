import { createHash, randomUUID } from "crypto";

import { InValue } from "@libsql/client";

import { DbConn } from "@connections/DbConn";
import { ApiError } from "@middlewares/ApiError";

export type PosPaymentMethod = "cash" | "qr_transfer" | "credit_card";

export type PosCheckoutPayload = {
	store_id: string;
	service_mode: "walk-in" | "pickup" | "delivery";
	payment_method: PosPaymentMethod;
	items: Array<{ product_id: string; qty: number }>;
	amount_tendered?: number | null;
	payment_account_id?: string | null;
	payment_reference?: string | null;
	payment_slip_url?: string | null;
	note?: string | null;
	idempotency_key: string;
	created_by: string;
	request_id?: string | null;
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

	static async ensureTables(): Promise<void> {
		if (OrderInterface.initialized) return;
		const db = DbConn.getClient();
		const info = await db.execute("PRAGMA table_info(orders)");
		const columns = new Set(info.rows.map((row) => String((row as Record<string, unknown>).name)));
		for (const [ name, definition ] of [
			[ "service_mode", "TEXT NOT NULL DEFAULT 'walk-in'" ],
			[ "amount_tendered", "REAL NOT NULL DEFAULT 0" ],
			[ "change_amount", "REAL NOT NULL DEFAULT 0" ],
			[ "payment_reference", "TEXT" ],
			[ "note", "TEXT" ],
		] as const) {
			if (!columns.has(name)) await db.execute(`ALTER TABLE orders ADD COLUMN ${name} ${definition}`);
		}
		await db.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_store_order_no ON orders (store_id, order_no)");
		await db.execute("CREATE INDEX IF NOT EXISTS idx_orders_store_created ON orders (store_id, created_at DESC)");
		await db.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_idempotency_store_action_key ON idempotency_requests (store_id, action, idempotency_key)");
		OrderInterface.initialized = true;
	}

	static async checkout(payload: PosCheckoutPayload): Promise<CheckoutResult> {
		await OrderInterface.ensureTables();
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

		const requestHash = createHash("sha256").update(json({ ...payload, request_id: undefined })).digest("hex");
		const db = DbConn.getClient();
		const previous = await db.execute({
			sql: "SELECT request_hash, status, response_body FROM idempotency_requests WHERE store_id = ? AND action = 'pos.checkout' AND idempotency_key = ? LIMIT 1",
			args: [ payload.store_id, payload.idempotency_key ],
		});
		const previousRow = previous.rows[0] as Record<string, unknown> | undefined;
		if (previousRow) {
			if (String(previousRow.request_hash) !== requestHash) throw ApiError.BadRequestError("Idempotency-Key was already used with different data");
			if (String(previousRow.status) === "completed" && previousRow.response_body) return JSON.parse(String(previousRow.response_body)) as CheckoutResult;
			throw ApiError.BadRequestError("checkout with this Idempotency-Key is already processing");
		}

		const transaction = await db.transaction("write");
		try {
			const storeResult = await transaction.execute({
				sql: "SELECT currency, vat_enabled, vat_rate, vat_mode, allow_negative_stock FROM stores WHERE id = ? LIMIT 1",
				args: [ payload.store_id ],
			});
			const store = storeResult.rows[0] as Record<string, unknown> | undefined;
			if (!store) throw ApiError.NotFoundError("store not found");

			const ids = [ ...merged.keys() ];
			const productsResult = await transaction.execute({
				sql: `SELECT p.id, p.sku, p.name, p.base_unit_id, p.price_base, p.cost_base, p.active,
					COALESCE(ib.on_hand_base, 0) AS on_hand_base, COALESCE(ib.reserved_base, 0) AS reserved_base
					FROM products p LEFT JOIN inventory_balances ib ON ib.store_id = p.store_id AND ib.product_id = p.id
					WHERE p.store_id = ? AND p.id IN (${ids.map(() => "?").join(",")})`,
				args: [ payload.store_id, ...ids ],
			});
			if (productsResult.rows.length !== ids.length) throw ApiError.BadRequestError("some products were not found in this store");

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
			const rawRate = Number(store.vat_rate || 0);
			const rate = rawRate > 100 ? rawRate / 100 : rawRate;
			const vatAmount = Number(store.vat_enabled)
				? Math.round(String(store.vat_mode).toUpperCase() === "INCLUSIVE" ? subtotal * rate / (100 + rate) : subtotal * rate / 100)
				: 0;
			const total = String(store.vat_mode).toUpperCase() === "INCLUSIVE" ? subtotal : subtotal + vatAmount;
			const amountTendered = payload.payment_method === "cash" ? Number(payload.amount_tendered) : total;
			if (!Number.isFinite(amountTendered) || amountTendered < total) throw ApiError.BadRequestError("amount_tendered is less than total");

			let paymentAccountId: string | null = null;
			if (payload.payment_method === "qr_transfer") {
				paymentAccountId = String(payload.payment_account_id || "").trim();
				if (!paymentAccountId) throw ApiError.BadRequestError("payment_account_id is required for QR / transfer");
				const account = await transaction.execute({
					sql: "SELECT id FROM store_payment_accounts WHERE id = ? AND store_id = ? AND is_active = 1 LIMIT 1",
					args: [ paymentAccountId, payload.store_id ],
				});
				if (!account.rows.length) throw ApiError.BadRequestError("payment account is invalid or inactive");
				const config = await transaction.execute("SELECT payment_require_slip_for_lao_qr FROM system_config WHERE id = 'global' LIMIT 1");
				const requireSlip = Number((config.rows[0] as Record<string, unknown> | undefined)?.payment_require_slip_for_lao_qr ?? 0) === 1;
				if (requireSlip && !String(payload.payment_slip_url || "").trim()) throw ApiError.BadRequestError("payment slip is required for QR / transfer");
			}

			const now = new Date().toISOString();
			const orderId = randomUUID();
			const orderNo = `POS-${now.slice(0, 10).replace(/-/g, "")}-${orderId.slice(0, 6).toUpperCase()}`;
			const result: CheckoutResult = {
				order_id: orderId, order_no: orderNo, subtotal, discount: 0, vat_amount: vatAmount, total,
				payment_method: payload.payment_method, amount_tendered: amountTendered,
				change_amount: amountTendered - total, completed_at: now,
			};

			await transaction.execute({
				sql: `INSERT INTO idempotency_requests (id, store_id, action, idempotency_key, request_hash, status, created_by, created_at)
					VALUES (?, ?, 'pos.checkout', ?, ?, 'processing', ?, ?)`,
				args: [ randomUUID(), payload.store_id, payload.idempotency_key, requestHash, payload.created_by, now ],
			});
			await transaction.execute({
				sql: `INSERT INTO orders (id, store_id, order_no, channel, status, subtotal, discount, vat_amount,
					shipping_fee_charged, total, shipping_cost, paid_at, created_by, created_at, payment_currency,
					payment_method, payment_account_id, payment_slip_url, payment_proof_submitted_at, payment_status,
					service_mode, amount_tendered, change_amount, payment_reference, note)
					VALUES (?, ?, ?, ?, 'completed', ?, 0, ?, 0, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, 'paid', ?, ?, ?, ?, ?)`,
				args: [ orderId, payload.store_id, orderNo, payload.service_mode, subtotal, vatAmount, total, now,
					payload.created_by, now, String(store.currency || "LAK"), payload.payment_method, paymentAccountId,
					payload.payment_slip_url || null, payload.payment_slip_url ? now : null, payload.service_mode,
					amountTendered, amountTendered - total, payload.payment_reference || null, payload.note || null ],
			});

			for (const line of lines) {
				const productId = String(line.row.id);
				await transaction.execute({
					sql: `INSERT INTO order_items (id, order_id, product_id, unit_id, qty, qty_base, price_base_at_sale, cost_base_at_sale, line_total)
						VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
					args: [ randomUUID(), orderId, productId, String(line.row.base_unit_id), line.qty, line.qty,
						Number(line.row.price_base || 0), Number(line.row.cost_base || 0), line.lineTotal ],
				});
				const nextOnHand = Number(line.row.on_hand_base) - line.qty;
				const reserved = Number(line.row.reserved_base);
				await transaction.execute({
					sql: `INSERT INTO inventory_balances (store_id, product_id, on_hand_base, reserved_base, available_base, updated_at)
						VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(store_id, product_id) DO UPDATE SET
						on_hand_base=excluded.on_hand_base, available_base=excluded.available_base, updated_at=excluded.updated_at`,
					args: [ payload.store_id, productId, nextOnHand, reserved, nextOnHand - reserved, now ],
				});
				await transaction.execute({
					sql: `INSERT INTO inventory_movements (id, store_id, product_id, type, qty_base, ref_type, ref_id, note, created_by, created_at)
						VALUES (?, ?, ?, 'SALE_OUT', ?, 'order', ?, ?, ?, ?)`,
					args: [ randomUUID(), payload.store_id, productId, -line.qty, orderId, payload.note || null, payload.created_by, now ],
				});
			}

			await transaction.execute({
				sql: `INSERT INTO cash_flow_entries (id, store_id, account_id, direction, entry_type, source_type, source_id,
					amount, currency, reference, note, metadata, occurred_at, created_by, created_at)
					VALUES (?, ?, ?, 'in', 'sale', 'order', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				args: [ randomUUID(), payload.store_id, paymentAccountId, orderId, total, String(store.currency || "LAK"),
					payload.payment_reference || null, payload.note || null, json({ payment_method: payload.payment_method, amount_tendered: amountTendered, change_amount: amountTendered - total }), now, payload.created_by, now ],
			});
			await transaction.execute({
				sql: `INSERT INTO audit_events (id, scope, store_id, actor_user_id, actor_role, action, entity_type, entity_id, result, request_id, metadata, occurred_at)
					VALUES (?, 'store', ?, ?, 'cashier', 'pos.checkout', 'order', ?, 'success', ?, ?, ?)`,
				args: [ randomUUID(), payload.store_id, payload.created_by, orderId, payload.request_id || null, json(result), now ],
			});
			await transaction.execute({
				sql: `UPDATE idempotency_requests SET status='completed', response_status=201, response_body=?, completed_at=?
					WHERE store_id=? AND action='pos.checkout' AND idempotency_key=?`,
				args: [ json(result), now, payload.store_id, payload.idempotency_key ],
			});
			await transaction.commit();
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
		const where = [ "o.store_id = ?" ];
		const args: InValue[] = [ filters.storeId ];
		if (filters.query) { where.push("(LOWER(o.order_no) LIKE ? OR LOWER(COALESCE(o.customer_name,'')) LIKE ? OR LOWER(COALESCE(u.name,'')) LIKE ?)"); const q = `%${filters.query.toLowerCase()}%`; args.push(q, q, q); }
		if (filters.status && filters.status !== "all") { where.push("o.status = ?"); args.push(filters.status); }
		if (filters.channel && filters.channel !== "all") { where.push("o.channel = ?"); args.push(filters.channel); }
		if (filters.paymentStatus && filters.paymentStatus !== "all") { where.push("o.payment_status = ?"); args.push(filters.paymentStatus); }
		if (filters.paymentMethod && filters.paymentMethod !== "all") { where.push("o.payment_method = ?"); args.push(filters.paymentMethod); }
		if (filters.from) { where.push("o.created_at >= ?"); args.push(filters.from); }
		if (filters.to) { where.push("o.created_at <= ?"); args.push(filters.to); }
		const result = await DbConn.getClient().execute({
			sql: `SELECT o.*, COALESCE(u.name, 'ผู้ใช้งาน') AS cashier_name,
				COALESCE(SUM(oi.qty), 0) AS item_count
				FROM orders o LEFT JOIN users u ON u.id = o.created_by LEFT JOIN order_items oi ON oi.order_id = o.id
				WHERE ${where.join(" AND ")} GROUP BY o.id ORDER BY o.created_at DESC LIMIT 500`,
			args,
		});
		const orders: Array<Record<string, unknown> & { lines: Record<string, unknown>[] }> = result.rows.map((row) => ({ ...(row as Record<string, unknown>), lines: [] }));
		if (!orders.length) return orders;
		const orderIds = orders.map((order) => String(order.id));
		const itemResult = await DbConn.getClient().execute({
			sql: `SELECT oi.*, p.name, p.sku FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id IN (${orderIds.map(() => "?").join(",")}) ORDER BY oi.id`,
			args: orderIds,
		});
		const byOrder = new Map<string, Record<string, unknown>[]>();
		for (const raw of itemResult.rows) { const row = raw as Record<string, unknown>; const list = byOrder.get(String(row.order_id)) || []; list.push(row); byOrder.set(String(row.order_id), list); }
		return orders.map((order) => ({ ...order, lines: byOrder.get(String(order.id)) || [] }));
	}
}
