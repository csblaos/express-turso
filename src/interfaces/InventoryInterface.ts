import { randomUUID } from "crypto";

import { Client, InValue } from "@libsql/client";

import { DbConn } from "@connections/DbConn";
import { ProductInterface } from "@interfaces/ProductInterface";

export type InventoryFilters = {
	storeId?: string;
	query?: string;
	status?: "all" | "low" | "out" | "negative" | "active" | "inactive";
	sort?: "updated" | "name" | "available";
};

export type InventoryBalanceListItem = {
	store_id: string;
	product_id: string;
	sku: string;
	name: string;
	barcode: string | null;
	image_url: string | null;
	location: string | null;
	category_id: string | null;
	category_name: string | null;
	base_unit_id: string;
	unit_name: string | null;
	active: number;
	low_stock_threshold: number | null;
	out_stock_threshold: number | null;
	on_hand_base: number;
	reserved_base: number;
	available_base: number;
	updated_at: string;
};

export type InventoryMovementListItem = {
	id: string;
	store_id: string;
	product_id: string;
	product_name: string;
	product_sku: string;
	type: string;
	qty_base: number;
	ref_type: string;
	ref_id: string | null;
	note: string | null;
	created_by: string | null;
	created_by_name: string | null;
	created_at: string;
	unit_name: string | null;
};

export type InventoryAdjustmentInput = {
	store_id: string;
	product_id: string;
	mode: "increment" | "decrement" | "set";
	qty_base: number;
	note?: string | null;
	created_by?: string | null;
};

export type InventoryAdjustmentResult = {
	balance: InventoryBalanceListItem;
	movement: InventoryMovementListItem;
};

export type InventoryBalanceNumbers = {
	on_hand_base: number;
	reserved_base: number;
};

type InventoryMovementFilters = {
	storeId?: string;
	productId?: string;
	limit?: number;
	query?: string;
	type?: string;
	from?: string;
	to?: string;
};

type SqlExecutor = Pick<Client, "execute">;

function resolvePublicProductImageUrl(imageUrl: string | null): string | null {
	if (!imageUrl) return null;
	const normalized = imageUrl.trim();
	if (!normalized) return null;
	if (/^(https?:\/\/|data:|blob:)/i.test(normalized) || normalized.startsWith("//")) return normalized;
	const base = String(process.env.R2_PUBLIC_BASE_URL || "").trim().replace(/\/$/, "");
	if (!base) return normalized;
	const path = normalized.startsWith("/") ? normalized : `/${normalized}`;
	return `${base}${path}`;
}

export class InventoryInterface {
	static async adjustStockWithinTransaction(
		db: SqlExecutor,
		input: InventoryAdjustmentInput,
		options: { refType?: string; refId?: string | null } = {},
	): Promise<InventoryAdjustmentResult> {
		await ProductInterface.ensureColumns();
		const productResult = await db.execute({
			sql: `
				SELECT
					p.store_id,
					p.id AS product_id,
					p.sku,
					p.name,
					p.barcode,
					p.image_url,
					p.location,
					p.category_id,
					pc.name AS category_name,
					p.base_unit_id,
					u.name_th AS unit_name,
					p.active,
					p.low_stock_threshold,
					p.out_stock_threshold
				FROM products p
				LEFT JOIN product_categories pc
					ON pc.id = p.category_id
				LEFT JOIN units u
					ON u.id = p.base_unit_id
				WHERE p.store_id = ? AND p.id = ?
				LIMIT 1
			`,
			args: [input.store_id, input.product_id],
		});

		const productRow = productResult.rows[0] as Record<string, unknown> | undefined;
		if (!productRow) {
			throw new Error("Product not found");
		}

		const current = await db.execute({
			sql: `
				SELECT store_id, product_id, on_hand_base, reserved_base, available_base, updated_at
				FROM inventory_balances
				WHERE store_id = ? AND product_id = ?
				LIMIT 1
			`,
			args: [input.store_id, input.product_id],
		});

		const currentRow = current.rows[0] as Record<string, unknown> | undefined;
		const currentOnHand = Number(currentRow?.on_hand_base ?? 0);
		const currentReserved = Number(currentRow?.reserved_base ?? 0);
		const qty = Number(input.qty_base);

		const nextOnHand = input.mode === "set"
			? qty
			: input.mode === "increment"
				? currentOnHand + qty
				: currentOnHand - qty;
		const nextAvailable = nextOnHand - currentReserved;
		const delta = input.mode === "set" ? nextOnHand - currentOnHand : input.mode === "increment" ? qty : -qty;
		const now = new Date().toISOString();
		const movementId = randomUUID();
		const refType = options.refType || "manual_adjustment";
		const movementType = input.mode === "set"
			? "ADJUSTMENT_SET"
			: input.mode === "increment"
				? "ADJUSTMENT_IN"
				: "ADJUSTMENT_OUT";

		await db.execute({
			sql: `
				INSERT INTO inventory_balances (
					store_id,
					product_id,
					on_hand_base,
					reserved_base,
					available_base,
					updated_at
				) VALUES (?, ?, ?, ?, ?, ?)
				ON CONFLICT(store_id, product_id) DO UPDATE SET
					on_hand_base = excluded.on_hand_base,
					reserved_base = excluded.reserved_base,
					available_base = excluded.available_base,
					updated_at = excluded.updated_at
			`,
			args: [
				input.store_id,
				input.product_id,
				nextOnHand,
				currentReserved,
				nextAvailable,
				now,
			],
		});

		await db.execute({
			sql: `
				INSERT INTO inventory_movements (
					id,
					store_id,
					product_id,
					type,
					qty_base,
					ref_type,
					ref_id,
					note,
					created_by,
					created_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			`,
			args: [
				movementId,
				input.store_id,
				input.product_id,
				movementType,
				delta,
				refType,
				options.refId ?? null,
				input.note ?? null,
				input.created_by ?? null,
				now,
			],
		});

		const balance: InventoryBalanceListItem = {
			store_id: String(productRow.store_id),
			product_id: String(productRow.product_id),
			sku: String(productRow.sku ?? ""),
			name: String(productRow.name ?? ""),
			barcode: productRow.barcode ? String(productRow.barcode) : null,
			image_url: resolvePublicProductImageUrl(productRow.image_url ? String(productRow.image_url) : null),
			location: productRow.location ? String(productRow.location) : null,
			category_id: productRow.category_id ? String(productRow.category_id) : null,
			category_name: productRow.category_name ? String(productRow.category_name) : null,
			base_unit_id: String(productRow.base_unit_id ?? ""),
			unit_name: productRow.unit_name ? String(productRow.unit_name) : null,
			active: Number(productRow.active ?? 1),
			low_stock_threshold: productRow.low_stock_threshold === null || productRow.low_stock_threshold === undefined ? null : Number(productRow.low_stock_threshold),
			out_stock_threshold: productRow.out_stock_threshold === null || productRow.out_stock_threshold === undefined ? null : Number(productRow.out_stock_threshold),
			on_hand_base: nextOnHand,
			reserved_base: currentReserved,
			available_base: nextAvailable,
			updated_at: now,
		};
		const movement: InventoryMovementListItem = {
			id: movementId,
			store_id: input.store_id,
			product_id: input.product_id,
			product_name: String(productRow.name ?? ""),
			product_sku: String(productRow.sku ?? ""),
			type: movementType,
			qty_base: delta,
			ref_type: refType,
			ref_id: options.refId ?? null,
			note: input.note ?? null,
			created_by: input.created_by ?? null,
			created_by_name: null,
			created_at: now,
			unit_name: productRow.unit_name ? String(productRow.unit_name) : null,
		};

		return {
			balance,
			movement,
		};
	}

	static async getBalanceNumbers(storeId: string, productId: string): Promise<InventoryBalanceNumbers> {
		const db = DbConn.getClient();
		const result = await db.execute({
			sql: `
				SELECT on_hand_base, reserved_base
				FROM inventory_balances
				WHERE store_id = ? AND product_id = ?
				LIMIT 1
			`,
			args: [ storeId, productId ],
		});

		const row = result.rows[0] as Record<string, unknown> | undefined;
		return {
			on_hand_base: Number(row?.on_hand_base ?? 0),
			reserved_base: Number(row?.reserved_base ?? 0),
		};
	}

	static async findBalances(filters: InventoryFilters = {}): Promise<InventoryBalanceListItem[]> {
		await ProductInterface.ensureColumns();
		const db = DbConn.getClient();
		const where: string[] = [];
		const args: InValue[] = [];

		if (filters.storeId) {
			where.push("p.store_id = ?");
			args.push(filters.storeId);
		}

		if (filters.query) {
			const like = `%${filters.query.trim().toLowerCase()}%`;
			where.push("(LOWER(p.name) LIKE ? OR LOWER(p.sku) LIKE ? OR LOWER(COALESCE(p.barcode, '')) LIKE ?)");
			args.push(like, like, like);
		}

		if (filters.status === "active") {
			where.push("p.active = 1");
		} else if (filters.status === "inactive") {
			where.push("p.active = 0");
		} else if (filters.status === "low") {
			where.push("p.active = 1 AND COALESCE(b.available_base, 0) <= COALESCE(NULLIF(p.low_stock_threshold, 0), 0) AND COALESCE(b.available_base, 0) > 0");
		} else if (filters.status === "out") {
			where.push("p.active = 1 AND COALESCE(b.available_base, 0) = 0");
		} else if (filters.status === "negative") {
			where.push("COALESCE(b.available_base, 0) < 0");
		}

		const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

		let orderBy = "COALESCE(b.updated_at, p.created_at) DESC, p.name ASC";
		if (filters.sort === "name") {
			orderBy = "p.name ASC";
		} else if (filters.sort === "available") {
			orderBy = "COALESCE(b.available_base, 0) ASC, p.name ASC";
		}

		const result = await db.execute({
			sql: `
				SELECT
					p.store_id,
					p.id AS product_id,
					p.sku,
					p.name,
					p.barcode,
					p.image_url,
					p.location,
					p.category_id,
					pc.name AS category_name,
					p.base_unit_id,
					u.name_th AS unit_name,
					p.active,
					p.low_stock_threshold,
					p.out_stock_threshold,
					COALESCE(b.on_hand_base, 0) AS on_hand_base,
					COALESCE(b.reserved_base, 0) AS reserved_base,
					COALESCE(b.available_base, 0) AS available_base,
					COALESCE(b.updated_at, p.created_at) AS updated_at
				FROM products p
				LEFT JOIN inventory_balances b
					ON b.product_id = p.id
					AND b.store_id = p.store_id
				LEFT JOIN product_categories pc
					ON pc.id = p.category_id
				LEFT JOIN units u
					ON u.id = p.base_unit_id
				${whereClause}
				ORDER BY ${orderBy}
			`,
			args,
		});

		return result.rows.map((row) => {
			const item = row as unknown as InventoryBalanceListItem;
			return {
				...item,
				image_url: resolvePublicProductImageUrl(item.image_url),
			};
		});
	}

	static async findBalanceByProductId(storeId: string, productId: string, executor?: SqlExecutor): Promise<InventoryBalanceListItem | null> {
		if (executor) {
			await ProductInterface.ensureColumns();
			const result = await executor.execute({
				sql: `
					SELECT
						p.store_id,
						p.id AS product_id,
						p.sku,
						p.name,
						p.barcode,
						p.image_url,
						p.location,
						p.category_id,
						pc.name AS category_name,
						p.base_unit_id,
						u.name_th AS unit_name,
						p.active,
						p.low_stock_threshold,
						p.out_stock_threshold,
						COALESCE(b.on_hand_base, 0) AS on_hand_base,
						COALESCE(b.reserved_base, 0) AS reserved_base,
						COALESCE(b.available_base, 0) AS available_base,
						COALESCE(b.updated_at, p.created_at) AS updated_at
					FROM products p
					LEFT JOIN inventory_balances b
						ON b.product_id = p.id
						AND b.store_id = p.store_id
					LEFT JOIN product_categories pc
						ON pc.id = p.category_id
					LEFT JOIN units u
						ON u.id = p.base_unit_id
					WHERE p.store_id = ? AND p.id = ?
					LIMIT 1
				`,
				args: [storeId, productId],
			});

			const row = result.rows[0] as unknown as InventoryBalanceListItem | undefined;
			if (!row) return null;
			return {
				...row,
				image_url: resolvePublicProductImageUrl(row.image_url),
			};
		}

		const rows = await InventoryInterface.findBalances({
			storeId,
		});

		return rows.find((row) => row.product_id === productId) ?? null;
	}

	static async findMovements(filters: InventoryMovementFilters, executor?: SqlExecutor): Promise<InventoryMovementListItem[]> {
		const db = executor || DbConn.getClient();
		const where: string[] = [];
		const args: InValue[] = [];

		if (filters.storeId) {
			where.push("m.store_id = ?");
			args.push(filters.storeId);
		}

		if (filters.productId) {
			where.push("m.product_id = ?");
			args.push(filters.productId);
		}

		if (filters.type) {
			const trimmed = filters.type.trim();
			if (trimmed === "ADJUSTMENT") {
				where.push("m.type LIKE 'ADJUSTMENT_%'");
			} else if (trimmed) {
				where.push("m.type = ?");
				args.push(trimmed);
			}
		}

			if (filters.query) {
				const like = `%${filters.query.trim().toLowerCase()}%`;
				where.push(`(
					LOWER(p.name) LIKE ?
					OR LOWER(p.sku) LIKE ?
					OR LOWER(COALESCE(p.barcode, '')) LIKE ?
					OR LOWER(COALESCE(m.note, '')) LIKE ?
					OR LOWER(COALESCE(m.created_by, '')) LIKE ?
					OR LOWER(COALESCE(actor.name, '')) LIKE ?
					OR LOWER(COALESCE(actor.email, '')) LIKE ?
				)`);
				args.push(like, like, like, like, like, like, like);
			}

		if (filters.from) {
			where.push("m.created_at >= ?");
			args.push(filters.from);
		}

		if (filters.to) {
			where.push("m.created_at <= ?");
			args.push(filters.to);
		}

		const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
		const limit = Math.max(1, Math.min(filters.limit ?? 20, 500));

		const result = await db.execute({
			sql: `
					SELECT
						m.id,
						m.store_id,
						m.product_id,
						p.name AS product_name,
						p.sku AS product_sku,
						m.type,
						m.qty_base,
						m.ref_type,
						m.ref_id,
						m.note,
						m.created_by,
						COALESCE(NULLIF(TRIM(actor.name), ''), NULLIF(TRIM(actor.email), '')) AS created_by_name,
						m.created_at,
						unit.name_th AS unit_name
					FROM inventory_movements m
					INNER JOIN products p ON p.id = m.product_id
					LEFT JOIN units unit ON unit.id = p.base_unit_id
					LEFT JOIN users actor ON actor.id = m.created_by
					${whereClause}
					ORDER BY m.created_at DESC
					LIMIT ${limit}
				`,
			args,
		});

		return result.rows.map((row) => row as unknown as InventoryMovementListItem);
	}

	static async adjustStock(
		input: InventoryAdjustmentInput,
		options: { refType?: string; refId?: string | null } = {},
	): Promise<InventoryAdjustmentResult> {
		const db = DbConn.getClient();
		const transaction = await db.transaction("write");
		try {
			const result = await InventoryInterface.adjustStockWithinTransaction(transaction, input, options);
			await transaction.commit();
			return result;
		} catch (error) {
			if (!transaction.closed) {
				try {
					await transaction.rollback();
				} catch {
					// ignore rollback errors; original error is more important
				}
			}
			throw error;
		} finally {
			transaction.close();
		}
	}
}
