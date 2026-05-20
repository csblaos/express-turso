import { randomUUID } from "crypto";

import { InValue } from "@libsql/client";

import { DbConn } from "@connections/DbConn";
import { ErrorConfig } from "@configs/ErrorConfig";
import { InventoryInterface } from "@interfaces/InventoryInterface";
import { ProductInterface } from "@interfaces/ProductInterface";
import { ApiError } from "@middlewares/ApiError";
import { CreatePurchaseOrderInput, PurchaseOrder } from "@models/PurchaseOrder";

export type PurchaseOrderListFilters = {
	storeId?: string;
	query?: string;
	status?: string;
	paymentStatus?: string;
};

export type PurchaseOrderListItem = PurchaseOrder & {
	item_count: number;
	total_qty_ordered: number;
	total_qty_received: number;
	total_estimated_base: number;
};

export type PurchaseOrderDetailItem = {
	id: string;
	purchase_order_id: string;
	product_id: string;
	product_name: string | null;
	product_sku: string | null;
	unit_name: string | null;
	qty_ordered: number;
	qty_received: number;
	unit_cost_purchase: number;
	unit_cost_base: number;
	landed_cost_per_unit: number;
	unit_id: string | null;
	multiplier_to_base: number;
	qty_base_ordered: number;
	qty_base_received: number;
};

export type PurchaseOrderDetailPayment = {
	id: string;
	purchase_order_id: string;
	store_id: string;
	entry_type: string;
	amount_base: number;
	paid_at: string;
	reference: string | null;
	note: string | null;
	reversed_payment_id: string | null;
	created_by: string | null;
	created_at: string;
};

export type PurchaseOrderReceiveLineInput = {
	item_id: string;
	qty_received: number;
};

export type PurchaseOrderDetail = {
	order: PurchaseOrderListItem;
	items: PurchaseOrderDetailItem[];
	payments: PurchaseOrderDetailPayment[];
};

export type PurchaseOrderCreateLineInput = {
	product_id: string;
	qty_ordered: number;
	unit_cost_purchase?: number;
	unit_cost_base?: number;
	landed_cost_per_unit?: number;
	unit_id?: string | null;
	multiplier_to_base?: number;
	qty_base_ordered?: number;
};

export type PurchaseOrderCreatePayload = Omit<CreatePurchaseOrderInput, "id" | "created_at"> & {
	items: PurchaseOrderCreateLineInput[];
};

export type PurchaseOrderUpdatePayload = PurchaseOrderCreatePayload & {
	updated_by?: string | null;
};

type SqlExecutor = Pick<ReturnType<typeof DbConn.getClient>, "execute">;

function toNumber(value: unknown): number {
	return Number(value ?? 0);
}

function normalizeOptionalString(value?: string | null): string | null {
	const trimmed = value?.trim();
	return trimmed ? trimmed : null;
}

function mapOrderRow(row: Record<string, unknown>): PurchaseOrderListItem {
	return {
		id: String(row.id),
		store_id: String(row.store_id),
		po_number: String(row.po_number),
		supplier_name: row.supplier_name ? String(row.supplier_name) : null,
		supplier_contact: row.supplier_contact ? String(row.supplier_contact) : null,
		purchase_currency: String(row.purchase_currency),
		exchange_rate: toNumber(row.exchange_rate),
		shipping_cost: toNumber(row.shipping_cost),
		other_cost: toNumber(row.other_cost),
		other_cost_note: row.other_cost_note ? String(row.other_cost_note) : null,
		status: String(row.status),
		ordered_at: row.ordered_at ? String(row.ordered_at) : null,
		expected_at: row.expected_at ? String(row.expected_at) : null,
		shipped_at: row.shipped_at ? String(row.shipped_at) : null,
		received_at: row.received_at ? String(row.received_at) : null,
		tracking_info: row.tracking_info ? String(row.tracking_info) : null,
		note: row.note ? String(row.note) : null,
		created_by: row.created_by ? String(row.created_by) : null,
		created_at: String(row.created_at),
		cancelled_at: row.cancelled_at ? String(row.cancelled_at) : null,
		updated_by: row.updated_by ? String(row.updated_by) : null,
		updated_at: row.updated_at ? String(row.updated_at) : null,
		exchange_rate_locked_at: row.exchange_rate_locked_at ? String(row.exchange_rate_locked_at) : null,
		exchange_rate_locked_by: row.exchange_rate_locked_by ? String(row.exchange_rate_locked_by) : null,
		exchange_rate_lock_note: row.exchange_rate_lock_note ? String(row.exchange_rate_lock_note) : null,
		exchange_rate_initial: toNumber(row.exchange_rate_initial),
		payment_status: String(row.payment_status),
		paid_at: row.paid_at ? String(row.paid_at) : null,
		paid_by: row.paid_by ? String(row.paid_by) : null,
		payment_reference: row.payment_reference ? String(row.payment_reference) : null,
		payment_note: row.payment_note ? String(row.payment_note) : null,
		due_date: row.due_date ? String(row.due_date) : null,
		shipping_cost_original: toNumber(row.shipping_cost_original),
		shipping_cost_currency: String(row.shipping_cost_currency ?? ""),
		other_cost_original: toNumber(row.other_cost_original),
		other_cost_currency: String(row.other_cost_currency ?? ""),
		item_count: toNumber(row.item_count),
		total_qty_ordered: toNumber(row.total_qty_ordered),
		total_qty_received: toNumber(row.total_qty_received),
		total_estimated_base: toNumber(row.total_estimated_base),
	};
}

function mapDetailItemRow(row: Record<string, unknown>): PurchaseOrderDetailItem {
	return {
		id: String(row.id),
		purchase_order_id: String(row.purchase_order_id),
		product_id: String(row.product_id),
		product_name: row.product_name ? String(row.product_name) : null,
		product_sku: row.product_sku ? String(row.product_sku) : null,
		unit_name: row.unit_name ? String(row.unit_name) : null,
		qty_ordered: toNumber(row.qty_ordered),
		qty_received: toNumber(row.qty_received),
		unit_cost_purchase: toNumber(row.unit_cost_purchase),
		unit_cost_base: toNumber(row.unit_cost_base),
		landed_cost_per_unit: toNumber(row.landed_cost_per_unit),
		unit_id: row.unit_id ? String(row.unit_id) : null,
		multiplier_to_base: toNumber(row.multiplier_to_base),
		qty_base_ordered: toNumber(row.qty_base_ordered),
		qty_base_received: toNumber(row.qty_base_received),
	};
}

function mapPaymentRow(row: Record<string, unknown>): PurchaseOrderDetailPayment {
	return {
		id: String(row.id),
		purchase_order_id: String(row.purchase_order_id),
		store_id: String(row.store_id),
		entry_type: String(row.entry_type),
		amount_base: toNumber(row.amount_base),
		paid_at: String(row.paid_at),
		reference: row.reference ? String(row.reference) : null,
		note: row.note ? String(row.note) : null,
		reversed_payment_id: row.reversed_payment_id ? String(row.reversed_payment_id) : null,
		created_by: row.created_by ? String(row.created_by) : null,
		created_at: String(row.created_at),
	};
}

function normalizePurchaseOrderLine(item: PurchaseOrderCreateLineInput, exchangeRate: number): PurchaseOrderCreateLineInput {
	const unitCostPurchase = item.unit_cost_purchase === undefined ? 0 : Number(item.unit_cost_purchase);
	const unitCostBase = item.unit_cost_base === undefined ? unitCostPurchase * exchangeRate : Number(item.unit_cost_base);
	const landedCostPerUnit = item.landed_cost_per_unit === undefined ? unitCostPurchase * exchangeRate : Number(item.landed_cost_per_unit);

	return {
		...item,
		product_id: item.product_id.trim(),
		qty_ordered: Number(item.qty_ordered),
		unit_cost_purchase: unitCostPurchase,
		unit_cost_base: unitCostBase,
		landed_cost_per_unit: landedCostPerUnit,
		unit_id: normalizeOptionalString(item.unit_id),
		multiplier_to_base: item.multiplier_to_base === undefined ? 1 : Number(item.multiplier_to_base),
		qty_base_ordered: item.qty_base_ordered === undefined ? undefined : Number(item.qty_base_ordered),
	};
}

export class PurchaseOrderInterface {
	private static initialized = false;

	private static async ensureTables(): Promise<void> {
		if (PurchaseOrderInterface.initialized) return;

		const db = DbConn.getClient();

		await db.execute(`
			CREATE TABLE IF NOT EXISTS purchase_orders (
				id TEXT PRIMARY KEY,
				store_id TEXT NOT NULL,
				po_number TEXT NOT NULL UNIQUE,
				supplier_name TEXT,
				supplier_contact TEXT,
				purchase_currency TEXT NOT NULL DEFAULT 'LAK',
				exchange_rate REAL NOT NULL DEFAULT 1,
				shipping_cost REAL NOT NULL DEFAULT 0,
				other_cost REAL NOT NULL DEFAULT 0,
				other_cost_note TEXT,
				status TEXT NOT NULL DEFAULT 'draft',
				ordered_at TEXT,
				expected_at TEXT,
				shipped_at TEXT,
				received_at TEXT,
				tracking_info TEXT,
				note TEXT,
				created_by TEXT,
				created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
				cancelled_at TEXT,
				updated_by TEXT,
				updated_at TEXT,
				exchange_rate_locked_at TEXT,
				exchange_rate_locked_by TEXT,
				exchange_rate_lock_note TEXT,
				exchange_rate_initial REAL NOT NULL DEFAULT 1,
				payment_status TEXT NOT NULL DEFAULT 'unpaid',
				paid_at TEXT,
				paid_by TEXT,
				payment_reference TEXT,
				payment_note TEXT,
				due_date TEXT,
				shipping_cost_original REAL NOT NULL DEFAULT 0,
				shipping_cost_currency TEXT NOT NULL DEFAULT 'LAK',
				other_cost_original REAL NOT NULL DEFAULT 0,
				other_cost_currency TEXT NOT NULL DEFAULT 'LAK'
			)
		`);

		await db.execute(`
			CREATE TABLE IF NOT EXISTS purchase_order_items (
				id TEXT PRIMARY KEY,
				purchase_order_id TEXT NOT NULL,
				product_id TEXT NOT NULL,
				qty_ordered REAL NOT NULL,
				qty_received REAL NOT NULL DEFAULT 0,
				unit_cost_purchase REAL NOT NULL DEFAULT 0,
				unit_cost_base REAL NOT NULL DEFAULT 0,
				landed_cost_per_unit REAL NOT NULL DEFAULT 0,
				unit_id TEXT,
				multiplier_to_base REAL NOT NULL DEFAULT 1,
				qty_base_ordered REAL NOT NULL DEFAULT 0,
				qty_base_received REAL NOT NULL DEFAULT 0
			)
		`);

		await db.execute(`
			CREATE TABLE IF NOT EXISTS purchase_order_payments (
				id TEXT PRIMARY KEY,
				purchase_order_id TEXT NOT NULL,
				store_id TEXT NOT NULL,
				entry_type TEXT NOT NULL DEFAULT 'payment',
				amount_base REAL NOT NULL,
				paid_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
				reference TEXT,
				note TEXT,
				reversed_payment_id TEXT,
				created_by TEXT,
				created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
			)
		`);

		await db.execute("CREATE INDEX IF NOT EXISTS idx_purchase_orders_store_created ON purchase_orders (store_id, created_at DESC)");
		await db.execute("CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders (status)");
		await db.execute("CREATE INDEX IF NOT EXISTS idx_purchase_order_items_po ON purchase_order_items (purchase_order_id)");
		await db.execute("CREATE INDEX IF NOT EXISTS idx_purchase_order_payments_po ON purchase_order_payments (purchase_order_id)");

		PurchaseOrderInterface.initialized = true;
	}

	static async findMany(filters: PurchaseOrderListFilters = {}): Promise<PurchaseOrderListItem[]> {
		await PurchaseOrderInterface.ensureTables();

		const db = DbConn.getClient();
		const where: string[] = [];
		const args: InValue[] = [];

		if (filters.storeId) {
			where.push("po.store_id = ?");
			args.push(filters.storeId);
		}

		if (filters.query) {
			const like = `%${filters.query.trim().toLowerCase()}%`;
			where.push("(LOWER(po.po_number) LIKE ? OR LOWER(COALESCE(po.supplier_name, '')) LIKE ? OR LOWER(COALESCE(po.supplier_contact, '')) LIKE ?)");
			args.push(like, like, like);
		}

		if (filters.status && filters.status !== "all") {
			where.push("po.status = ?");
			args.push(filters.status);
		}

		if (filters.paymentStatus && filters.paymentStatus !== "all") {
			where.push("po.payment_status = ?");
			args.push(filters.paymentStatus);
		}

		const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

		const result = await db.execute({
			sql: `
				SELECT
					po.*,
					COUNT(poi.id) AS item_count,
					COALESCE(SUM(poi.qty_ordered), 0) AS total_qty_ordered,
					COALESCE(SUM(poi.qty_received), 0) AS total_qty_received,
					COALESCE(SUM(poi.qty_ordered * poi.unit_cost_base), 0) + po.shipping_cost + po.other_cost AS total_estimated_base
				FROM purchase_orders po
				LEFT JOIN purchase_order_items poi ON poi.purchase_order_id = po.id
				${whereClause}
				GROUP BY po.id
				ORDER BY COALESCE(po.updated_at, po.created_at) DESC, po.po_number DESC
			`,
			args,
		});

		return result.rows.map((row) => mapOrderRow(row as Record<string, unknown>));
	}

	static async findById(id: string, executor?: SqlExecutor): Promise<PurchaseOrderDetail | null> {
		await PurchaseOrderInterface.ensureTables();

		const db = executor || DbConn.getClient();
		const orderResult = await db.execute({
			sql: "SELECT * FROM purchase_orders WHERE id = ? LIMIT 1",
			args: [id],
		});

		const orderRow = orderResult.rows[0] as Record<string, unknown> | undefined;
		if (!orderRow) return null;

		const [itemsResult, paymentsResult] = await Promise.all([
			db.execute({
				sql: `
					SELECT
						poi.*,
						p.name AS product_name,
						p.sku AS product_sku,
						u.name_th AS unit_name
					FROM purchase_order_items poi
					LEFT JOIN products p ON p.id = poi.product_id
					LEFT JOIN units u ON u.id = poi.unit_id
					WHERE poi.purchase_order_id = ?
					ORDER BY poi.id ASC
				`,
				args: [id],
			}),
			db.execute({
				sql: `
					SELECT *
					FROM purchase_order_payments
					WHERE purchase_order_id = ?
					ORDER BY paid_at DESC, created_at DESC
				`,
				args: [id],
			}),
		]);

		const itemRows = itemsResult.rows.map((row) => mapDetailItemRow(row as Record<string, unknown>));
		const summary = itemRows.reduce((accumulator, item) => {
			accumulator.itemCount += 1;
			accumulator.totalQtyOrdered += toNumber(item.qty_ordered);
			accumulator.totalQtyReceived += toNumber(item.qty_received);
			accumulator.totalEstimatedBase += toNumber(item.qty_ordered) * toNumber(item.unit_cost_base);
			return accumulator;
		}, {
			itemCount: 0,
			totalQtyOrdered: 0,
			totalQtyReceived: 0,
			totalEstimatedBase: 0,
		});

		const order = mapOrderRow({
			...orderRow,
			item_count: summary.itemCount,
			total_qty_ordered: summary.totalQtyOrdered,
			total_qty_received: summary.totalQtyReceived,
			total_estimated_base: summary.totalEstimatedBase + toNumber(orderRow.shipping_cost) + toNumber(orderRow.other_cost),
		});

		return {
			order,
			items: itemRows,
			payments: paymentsResult.rows.map((row) => mapPaymentRow(row as Record<string, unknown>)),
		};
	}

	static async create(payload: PurchaseOrderCreatePayload): Promise<PurchaseOrderDetail> {
		await PurchaseOrderInterface.ensureTables();

		const db = DbConn.getClient();
		const id = randomUUID();
		const createdAt = new Date().toISOString();
		const exchangeRate = Number(payload.exchange_rate ?? 1) || 1;
		const normalizedItems = payload.items.map((item) => normalizePurchaseOrderLine(item, exchangeRate));

		const transaction = await db.transaction("write");
		try {
			await transaction.execute({
				sql: `
					INSERT INTO purchase_orders (
						id, store_id, po_number, supplier_name, supplier_contact, purchase_currency,
						exchange_rate, shipping_cost, other_cost, other_cost_note, status,
						ordered_at, expected_at, shipped_at, received_at, tracking_info, note,
						created_by, created_at, cancelled_at, updated_by, updated_at,
						exchange_rate_locked_at, exchange_rate_locked_by, exchange_rate_lock_note,
						exchange_rate_initial, payment_status, paid_at, paid_by, payment_reference,
						payment_note, due_date, shipping_cost_original, shipping_cost_currency,
						other_cost_original, other_cost_currency
					) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				`,
				args: [
					id,
					payload.store_id,
					payload.po_number,
					payload.supplier_name ?? null,
					payload.supplier_contact ?? null,
					payload.purchase_currency ?? "LAK",
					payload.exchange_rate ?? 1,
					payload.shipping_cost ?? 0,
					payload.other_cost ?? 0,
					payload.other_cost_note ?? null,
					payload.status ?? "draft",
					payload.ordered_at ?? null,
					payload.expected_at ?? null,
					payload.shipped_at ?? null,
					payload.received_at ?? null,
					payload.tracking_info ?? null,
					payload.note ?? null,
					payload.created_by ?? null,
					createdAt,
					payload.cancelled_at ?? null,
					payload.updated_by ?? null,
					payload.updated_at ?? null,
					payload.exchange_rate_locked_at ?? null,
					payload.exchange_rate_locked_by ?? null,
					payload.exchange_rate_lock_note ?? null,
					payload.exchange_rate_initial ?? payload.exchange_rate ?? 1,
					payload.payment_status ?? "unpaid",
					payload.paid_at ?? null,
					payload.paid_by ?? null,
					payload.payment_reference ?? null,
					payload.payment_note ?? null,
					payload.due_date ?? null,
					payload.shipping_cost_original ?? payload.shipping_cost ?? 0,
					payload.shipping_cost_currency ?? payload.purchase_currency ?? "LAK",
					payload.other_cost_original ?? payload.other_cost ?? 0,
					payload.other_cost_currency ?? payload.purchase_currency ?? "LAK",
				],
			});

			for (const item of normalizedItems) {
				const multiplier = item.multiplier_to_base ?? 1;
				const qtyOrdered = item.qty_ordered;
				const qtyBaseOrdered = item.qty_base_ordered ?? qtyOrdered * multiplier;

				await transaction.execute({
					sql: `
						INSERT INTO purchase_order_items (
							id, purchase_order_id, product_id, qty_ordered, qty_received,
							unit_cost_purchase, unit_cost_base, landed_cost_per_unit, unit_id,
							multiplier_to_base, qty_base_ordered, qty_base_received
						) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
					`,
					args: [
						randomUUID(),
						id,
						item.product_id,
						qtyOrdered,
						0,
						item.unit_cost_purchase ?? 0,
						item.unit_cost_base ?? item.unit_cost_purchase ?? 0,
						item.landed_cost_per_unit ?? item.unit_cost_base ?? item.unit_cost_purchase ?? 0,
						item.unit_id ?? null,
						multiplier,
						qtyBaseOrdered,
						0,
					],
				});
			}

			await transaction.commit();
		} catch (error) {
			if (!transaction.closed) {
				try {
					await transaction.rollback();
				} catch {
					// keep original error
				}
			}
			throw error;
		} finally {
			transaction.close();
		}

		const created = await PurchaseOrderInterface.findById(id);
		if (!created) {
			throw new Error("Failed to load created purchase order");
		}

		return created;
	}

	static async update(id: string, payload: PurchaseOrderUpdatePayload): Promise<PurchaseOrderDetail | null> {
		await PurchaseOrderInterface.ensureTables();

		const detail = await PurchaseOrderInterface.findById(id);
		if (!detail) return null;
		const canEditItems = detail.order.status === "draft";

		const storeId = payload.store_id?.trim() || detail.order.store_id;
		if (storeId !== detail.order.store_id) {
			throw ApiError.BadRequestError("store_id cannot be changed");
		}

		if (!Array.isArray(payload.items) || payload.items.length === 0) {
			throw ApiError.BadRequestError("items must have at least one line");
		}

		if (canEditItems) {
			for (const item of payload.items) {
				if (!item.product_id?.trim()) {
					throw ApiError.BadRequestError("each item requires product_id");
				}

				if (!Number.isFinite(Number(item.qty_ordered)) || Number(item.qty_ordered) <= 0) {
					throw ApiError.BadRequestError("qty_ordered must be greater than 0");
				}

				const product = await ProductInterface.findById(item.product_id);
				if (!product || product.store_id !== detail.order.store_id) {
					throw ApiError.CustomError(ErrorConfig.DOMAIN.PRODUCT_NOT_FOUND);
				}
			}
		}

		const exchangeRate = Number(payload.exchange_rate ?? detail.order.exchange_rate ?? 1) || 1;
		const normalizedItems = payload.items.map((item) => normalizePurchaseOrderLine(item, exchangeRate));
		const now = new Date().toISOString();
		const db = DbConn.getClient();
		const transaction = await db.transaction("write");
		try {
			await transaction.execute({
				sql: `
					UPDATE purchase_orders
					SET store_id = ?,
						supplier_name = ?,
						supplier_contact = ?,
						purchase_currency = ?,
						exchange_rate = ?,
						shipping_cost = ?,
						other_cost = ?,
						other_cost_note = ?,
						expected_at = ?,
						note = ?,
						updated_by = ?,
						updated_at = ?,
						exchange_rate_initial = ?,
						shipping_cost_original = ?,
						shipping_cost_currency = ?,
						other_cost_original = ?,
						other_cost_currency = ?
					WHERE id = ?
				`,
				args: [
					detail.order.store_id,
					payload.supplier_name ?? null,
					payload.supplier_contact ?? null,
					payload.purchase_currency ?? detail.order.purchase_currency,
					exchangeRate,
					payload.shipping_cost ?? 0,
					payload.other_cost ?? 0,
					payload.other_cost_note ?? null,
					payload.expected_at ?? null,
					payload.note ?? null,
					payload.updated_by ?? null,
					now,
					payload.exchange_rate_initial ?? exchangeRate,
					payload.shipping_cost_original ?? payload.shipping_cost ?? 0,
					payload.shipping_cost_currency ?? payload.purchase_currency ?? detail.order.purchase_currency,
					payload.other_cost_original ?? payload.other_cost ?? 0,
					payload.other_cost_currency ?? payload.purchase_currency ?? detail.order.purchase_currency,
					id,
				],
			});

			if (canEditItems) {
					await transaction.execute({
						sql: "DELETE FROM purchase_order_items WHERE purchase_order_id = ?",
						args: [id],
					});

				for (const item of normalizedItems) {
					const multiplier = item.multiplier_to_base ?? 1;
					const qtyOrdered = item.qty_ordered;
					const qtyBaseOrdered = item.qty_base_ordered ?? qtyOrdered * multiplier;

						await transaction.execute({
							sql: `
								INSERT INTO purchase_order_items (
								id, purchase_order_id, product_id, qty_ordered, qty_received,
								unit_cost_purchase, unit_cost_base, landed_cost_per_unit, unit_id,
								multiplier_to_base, qty_base_ordered, qty_base_received
							) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
						`,
						args: [
							randomUUID(),
							id,
							item.product_id,
							qtyOrdered,
							0,
							item.unit_cost_purchase ?? 0,
							item.unit_cost_base ?? item.unit_cost_purchase ?? 0,
							item.landed_cost_per_unit ?? item.unit_cost_base ?? item.unit_cost_purchase ?? 0,
							item.unit_id ?? null,
							multiplier,
							qtyBaseOrdered,
							0,
						],
					});
				}
			}

			await transaction.commit();
		} catch (error) {
			if (!transaction.closed) {
				try {
					await transaction.rollback();
				} catch {
					// keep original error
				}
			}
			throw error;
		} finally {
			transaction.close();
		}

		return PurchaseOrderInterface.findById(id);
	}

	static async markOrdered(
		id: string,
		orderedBy: string | null,
		orderedAt?: string | null,
	): Promise<PurchaseOrderDetail | null> {
		await PurchaseOrderInterface.ensureTables();

		const db = DbConn.getClient();
		const now = new Date().toISOString();
		const transaction = await db.transaction("write");

		try {
			const detail = await PurchaseOrderInterface.findById(id, transaction);
			if (!detail) {
				return null;
			}
			if (detail.order.status !== "draft") {
				throw ApiError.BadRequestError("only draft purchase order can be marked as ordered");
			}

			await transaction.execute({
				sql: `
					UPDATE purchase_orders
					SET status = ?,
						ordered_at = ?,
						updated_by = ?,
						updated_at = ?
					WHERE id = ?
				`,
				args: [ "ordered", orderedAt || detail.order.ordered_at || now, orderedBy, now, id ],
			});

			await transaction.commit();
			return PurchaseOrderInterface.findById(id);
		} catch (error) {
			if (!transaction.closed) {
				try {
					await transaction.rollback();
				} catch {
					// keep original error
				}
			}
			throw error;
		} finally {
			transaction.close();
		}
	}

	static async markArrived(
		id: string,
		arrivedBy: string | null,
		arrivedAt?: string | null,
	): Promise<PurchaseOrderDetail | null> {
		await PurchaseOrderInterface.ensureTables();

		const db = DbConn.getClient();
		const now = new Date().toISOString();
		const transaction = await db.transaction("write");

		try {
			const detail = await PurchaseOrderInterface.findById(id, transaction);
			if (!detail) {
				return null;
			}
			if (detail.order.status === "received" || detail.order.status === "partial") {
				throw ApiError.BadRequestError("purchase order that already received cannot be marked as arrived");
			}
			if (detail.order.status === "cancelled") {
				throw ApiError.BadRequestError("cancelled purchase order cannot be marked as arrived");
			}
			if (detail.order.status === "draft") {
				throw ApiError.BadRequestError("draft purchase order cannot be marked as arrived");
			}
			if (detail.order.status === "arrived") {
				return detail;
			}

			await transaction.execute({
				sql: `
					UPDATE purchase_orders
					SET status = ?,
						updated_by = ?,
						updated_at = ?
					WHERE id = ?
				`,
				args: [ "arrived", arrivedBy, arrivedAt || now, id ],
			});

			await transaction.commit();
			return PurchaseOrderInterface.findById(id);
		} catch (error) {
			if (!transaction.closed) {
				try {
					await transaction.rollback();
				} catch {
					// keep original error
				}
			}
			throw error;
		} finally {
			transaction.close();
		}
	}

	static async markReceived(
		id: string,
		receivedAt: string,
		receivedBy: string | null,
		lineReceipts: PurchaseOrderReceiveLineInput[] = [],
	): Promise<PurchaseOrderDetail | null> {
		await PurchaseOrderInterface.ensureTables();
		const db = DbConn.getClient();
		const transaction = await db.transaction("write");
		try {
			const detail = await PurchaseOrderInterface.findById(id, transaction);
			if (!detail) {
				throw ApiError.NotFoundError("Purchase order not found");
			}
			const receiptMap = new Map(lineReceipts.map((line) => [line.item_id, Number(line.qty_received)]));
			const receiveAll = lineReceipts.length === 0;
			let hasAnyReceived = false;
			let hasRemaining = false;

			for (const item of detail.items) {
				const remainingQty = Math.max(0, toNumber(item.qty_ordered) - toNumber(item.qty_received));
				const requestedQty = receiveAll ? remainingQty : Number(receiptMap.get(item.id) ?? 0);
				if (!Number.isFinite(requestedQty) || requestedQty < 0) {
					throw ApiError.BadRequestError("qty_received must be a valid number");
				}

				if (!receiveAll && !receiptMap.has(item.id)) {
					if (remainingQty > 0) {
						hasRemaining = true;
					}
					continue;
				}

				if (requestedQty > remainingQty) {
					throw ApiError.BadRequestError("qty_received cannot exceed remaining quantity");
				}

				if (requestedQty <= 0) {
					continue;
				}

				hasAnyReceived = true;
				const nextQtyReceived = toNumber(item.qty_received) + requestedQty;
				const nextQtyBaseReceived = toNumber(item.qty_base_received) + (requestedQty * toNumber(item.multiplier_to_base || 1));

					await InventoryInterface.adjustStockWithinTransaction(transaction, {
						store_id: detail.order.store_id,
						product_id: item.product_id,
						mode: "increment",
					qty_base: requestedQty * toNumber(item.multiplier_to_base || 1),
					note: `รับสินค้า PO ${detail.order.po_number}`,
					created_by: receivedBy,
				}, {
					refType: "purchase_order",
					refId: detail.order.id,
				});

					await transaction.execute({
						sql: `
							UPDATE purchase_order_items
							SET qty_received = ?,
							qty_base_received = ?
						WHERE purchase_order_id = ? AND id = ?
					`,
					args: [nextQtyReceived, nextQtyBaseReceived, id, item.id],
				});

				if (nextQtyReceived < toNumber(item.qty_ordered)) {
					hasRemaining = true;
				}
			}

			if (!hasAnyReceived) {
				throw ApiError.BadRequestError("receive quantity must be greater than 0");
			}

			await transaction.execute({
				sql: `
					UPDATE purchase_orders
					SET status = ?,
						received_at = ?,
						updated_by = ?,
						updated_at = ?
					WHERE id = ?
				`,
				args: [hasRemaining ? "partial" : "received", detail.order.received_at ?? receivedAt, receivedBy, receivedAt, id],
			});

			await transaction.commit();
			return PurchaseOrderInterface.findById(id);
		} catch (error) {
			if (!transaction.closed) {
				try {
					await transaction.rollback();
				} catch {
					// keep original error
				}
			}
			throw error;
		} finally {
			transaction.close();
		}
	}
}
