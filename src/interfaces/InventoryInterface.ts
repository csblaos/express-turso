import { randomUUID } from "crypto";

import { InValue } from "@libsql/client";

import { DbConn } from "@connections/DbConn";

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

type InventoryMovementFilters = {
	storeId?: string;
	productId?: string;
	limit?: number;
	query?: string;
	type?: string;
	from?: string;
	to?: string;
};

function resolvePublicProductImageUrl(imageUrl: string | null): string | null {
	if (!imageUrl) return null;
	if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
	const base = String(process.env.R2_PUBLIC_BASE_URL || "").trim().replace(/\/$/, "");
	if (!base) return imageUrl;
	const path = imageUrl.startsWith("/") ? imageUrl : `/${imageUrl}`;
	return `${base}${path}`;
}

export class InventoryInterface {
	static async findBalances(filters: InventoryFilters = {}): Promise<InventoryBalanceListItem[]> {
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

	static async findBalanceByProductId(storeId: string, productId: string): Promise<InventoryBalanceListItem | null> {
		const rows = await InventoryInterface.findBalances({
			storeId,
		});

		return rows.find((row) => row.product_id === productId) ?? null;
	}

	static async findMovements(filters: InventoryMovementFilters): Promise<InventoryMovementListItem[]> {
		const db = DbConn.getClient();
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
			)`);
			args.push(like, like, like, like, like);
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
					m.created_at,
					u.name_th AS unit_name
				FROM inventory_movements m
				INNER JOIN products p ON p.id = m.product_id
				LEFT JOIN units u ON u.id = p.base_unit_id
				${whereClause}
				ORDER BY m.created_at DESC
				LIMIT ${limit}
			`,
			args,
		});

		return result.rows.map((row) => row as unknown as InventoryMovementListItem);
	}

	static async adjustStock(input: InventoryAdjustmentInput): Promise<InventoryAdjustmentResult> {
		const db = DbConn.getClient();
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
				"manual_adjustment",
				null,
				input.note ?? null,
				input.created_by ?? null,
				now,
			],
		});

		const balance = await InventoryInterface.findBalanceByProductId(input.store_id, input.product_id);
		const movementRows = await InventoryInterface.findMovements({
			storeId: input.store_id,
			productId: input.product_id,
			limit: 1,
		});

		if (!balance || movementRows.length === 0) {
			throw new Error("Failed to adjust inventory");
		}

		return {
			balance,
			movement: movementRows[0],
		};
	}
}
