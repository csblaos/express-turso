import { randomUUID } from "crypto";

import { InValue } from "@libsql/client";

import { DbConn } from "@connections/DbConn";
import { CreateProductInput, Product, UpdateProductInput } from "@models/Product";

type ProductWritableKey = Exclude<keyof Product, "id">;

export type ProductListItem = Product & {
	category_name: string | null;
	base_unit_name: string | null;
	extra_sale_unit_count: number;
	has_purchase_cost: number;
};

export type ProductBaseUnitCheck = {
	product_id: string;
	can_change: boolean;
	counts: {
		stock_on_hand: number;
		inventory_movements: number;
		order_items: number;
		purchase_order_items: number;
		extra_units: number;
	};
	reasons: string[];
};

export type ProductListResult = {
	items: ProductListItem[];
	total: number;
	page: number;
	limit: number;
	totalPages: number;
	stats: {
		total: number;
		active: number;
		inactive: number;
		lowStock: number;
	};
	categoryCounts: Record<string, number>;
};

export type ProductImportRow = {
	name: string;
	sku: string;
	barcode: string | null;
	category_id: string | null;
	base_unit_id: string;
	price_base: number;
	cost_base: number;
	location: string | null;
	low_stock_threshold: number | null;
};

export type ProductImportResult = {
	created: number;
	updated: number;
	total: number;
	missingCategoryIds: string[];
	missingUnitIds: string[];
};

const PRODUCT_OPTIONAL_COLUMNS = [
	{
		name: "updated_at",
		sql: "ALTER TABLE products ADD COLUMN updated_at TEXT",
	},
	{
		name: "deleted_at",
		sql: "ALTER TABLE products ADD COLUMN deleted_at TEXT",
	},
	{
		name: "location",
		sql: "ALTER TABLE products ADD COLUMN location TEXT",
	},
	{
		name: "inventory_mode",
		sql: "ALTER TABLE products ADD COLUMN inventory_mode TEXT NOT NULL DEFAULT 'tracked'",
	},
	{
		name: "cost_source",
		sql: "ALTER TABLE products ADD COLUMN cost_source TEXT NOT NULL DEFAULT 'purchase'",
	},
	{
		name: "manual_sold_out",
		sql: "ALTER TABLE products ADD COLUMN manual_sold_out INTEGER NOT NULL DEFAULT 0",
	},
] as const;

function getInsertPayload(payload: CreateProductInput): Record<string, InValue> {
	const result: Record<string, InValue> = {
		id: payload.id || randomUUID(),
	};

	for (const [ key, value ] of Object.entries(payload)) {
		if (key === "id") continue;
		if (value === undefined) continue;
		result[key] = value;
	}

	return result;
}

function getUpdatePayload(data: UpdateProductInput): Record<string, InValue> {
	const result: Record<string, InValue> = {};

	for (const [ key, value ] of Object.entries(data)) {
		if (key === "id") continue;
		if (value === undefined) continue;
		result[key] = value;
	}

	return result;
}

export class ProductInterface {
	private static ensured = false;
	private static ensureColumnsPromise: Promise<void> | null = null;

	static async ensureColumns(): Promise<void> {
		if (ProductInterface.ensured) return;
		if (ProductInterface.ensureColumnsPromise) return ProductInterface.ensureColumnsPromise;

		ProductInterface.ensureColumnsPromise = (async () => {
			const db = DbConn.getClient();
			const pragmaResult = await db.execute("PRAGMA table_info(products)");
			const existingColumns = new Set(
				pragmaResult.rows.map((row) => String(row.name || "")),
			);

			for (const column of PRODUCT_OPTIONAL_COLUMNS) {
				if (existingColumns.has(column.name)) continue;
				await db.execute(column.sql);
			}

			await Promise.all([
				db.execute("CREATE INDEX IF NOT EXISTS idx_products_store_deleted_created ON products (store_id, deleted_at, created_at DESC)"),
				db.execute("CREATE INDEX IF NOT EXISTS idx_products_store_deleted_active ON products (store_id, deleted_at, active)"),
				db.execute("CREATE INDEX IF NOT EXISTS idx_products_store_deleted_category ON products (store_id, deleted_at, category_id)"),
				db.execute("CREATE INDEX IF NOT EXISTS idx_products_store_sku ON products (store_id, sku)"),
				db.execute("CREATE INDEX IF NOT EXISTS idx_products_store_barcode ON products (store_id, barcode)"),
				db.execute("CREATE INDEX IF NOT EXISTS idx_product_units_product_enabled ON product_units (product_id, enabled_for_sale, unit_id)"),
			]);

			ProductInterface.ensured = true;
		})().catch((error) => {
			ProductInterface.ensureColumnsPromise = null;
			throw error;
		});

		return ProductInterface.ensureColumnsPromise;
	}

	static async findAll(storeId?: string): Promise<Product[]> {
		await ProductInterface.ensureColumns();
		const db = DbConn.getClient();

		if (storeId) {
			const result = await db.execute({
				sql: "SELECT * FROM products WHERE store_id = ? AND deleted_at IS NULL ORDER BY created_at DESC",
				args: [ storeId ],
			});
			return result.rows.map(ProductInterface.mapRow);
		}

		const result = await db.execute("SELECT * FROM products WHERE deleted_at IS NULL ORDER BY created_at DESC");
		return result.rows.map(ProductInterface.mapRow);
	}

	static async findPage(input: {
		storeId?: string;
		page: number;
		limit: number;
		search?: string;
		categoryId?: string;
		status?: "all" | "active" | "inactive";
		sort?: "updated" | "name" | "price";
	}): Promise<ProductListResult> {
		await ProductInterface.ensureColumns();
		const db = DbConn.getClient();
		const conditions = ["p.deleted_at IS NULL"];
		const args: InValue[] = [];

		if (input.storeId) {
			conditions.push("p.store_id = ?");
			args.push(input.storeId);
		}
		const search = String(input.search || "").trim();
		if (search) {
			conditions.push("(LOWER(p.name) LIKE ? OR LOWER(p.sku) LIKE ? OR LOWER(COALESCE(p.barcode, '')) LIKE ?)");
			const pattern = `%${search.toLowerCase()}%`;
			args.push(pattern, pattern, pattern);
		}
		if (input.categoryId && input.categoryId !== "all") {
			if (input.categoryId === "uncategorized") {
				conditions.push("p.category_id IS NULL");
			} else {
				conditions.push("p.category_id = ?");
				args.push(input.categoryId);
			}
		}
		if (input.status === "active") conditions.push("p.active = 1");
		if (input.status === "inactive") conditions.push("p.active = 0");

		const where = conditions.join(" AND ");
		const orderBy = input.sort === "name"
			? "p.name COLLATE NOCASE ASC, p.id ASC"
			: input.sort === "price"
				? "p.price_base DESC, p.id ASC"
				: "p.created_at DESC, p.id DESC";
		const page = Math.max(1, Math.floor(input.page));
		const limit = Math.min(100, Math.max(1, Math.floor(input.limit)));
		const offset = (page - 1) * limit;

		const [itemsResult, countResult, statsResult, categoriesResult] = await db.batch([
			{
				sql: `SELECT p.*,
					pc.name AS category_name,
					COALESCE(u.name_th, u.code) AS base_unit_name,
					(SELECT COUNT(DISTINCT pu.unit_id) FROM product_units pu WHERE pu.product_id = p.id AND pu.enabled_for_sale = 1) AS extra_sale_unit_count,
					-- cost_source only records whether the cost is pinned, so the
					-- receipt ledger is what proves a cost genuinely came from a
					-- purchase order rather than being typed in at creation.
					CASE WHEN ics.product_id IS NULL THEN 0 ELSE 1 END AS has_purchase_cost
				FROM products p
				LEFT JOIN product_categories pc ON pc.id = p.category_id
				LEFT JOIN units u ON u.id = p.base_unit_id
				LEFT JOIN inventory_cost_summaries ics ON ics.product_id = p.id AND ics.store_id = p.store_id
				WHERE ${where}
				ORDER BY ${orderBy}
				LIMIT ? OFFSET ?`,
				args: [ ...args, limit, offset ],
			},
			{ sql: `SELECT COUNT(*) AS total FROM products p WHERE ${where}`, args },
			{
				sql: `SELECT
					COUNT(*) AS total,
					SUM(CASE WHEN p.active = 1 THEN 1 ELSE 0 END) AS active,
					SUM(CASE WHEN p.active = 0 THEN 1 ELSE 0 END) AS inactive,
					SUM(CASE WHEN p.active = 1 AND COALESCE(p.low_stock_threshold, 0) > 0 THEN 1 ELSE 0 END) AS low_stock
				FROM products p WHERE p.deleted_at IS NULL${input.storeId ? " AND p.store_id = ?" : ""}`,
				args: input.storeId ? [ input.storeId ] : [],
			},
			{
				sql: `SELECT COALESCE(p.category_id, 'uncategorized') AS category_id, COUNT(*) AS total
				FROM products p WHERE p.deleted_at IS NULL${input.storeId ? " AND p.store_id = ?" : ""}
				GROUP BY COALESCE(p.category_id, 'uncategorized')`,
				args: input.storeId ? [ input.storeId ] : [],
			},
		], "read");

		const total = Number(countResult.rows[0]?.total || 0);
		const statsRow = statsResult.rows[0] || {};
		return {
			items: itemsResult.rows.map((row) => row as unknown as ProductListItem),
			total,
			page,
			limit,
			totalPages: Math.max(1, Math.ceil(total / limit)),
			stats: {
				total: Number(statsRow.total || 0),
				active: Number(statsRow.active || 0),
				inactive: Number(statsRow.inactive || 0),
				lowStock: Number(statsRow.low_stock || 0),
			},
			categoryCounts: Object.fromEntries(categoriesResult.rows.map((row) => [ String(row.category_id), Number(row.total || 0) ])),
		};
	}

	static async findBySkus(storeId: string, skus: string[]): Promise<Product[]> {
		await ProductInterface.ensureColumns();
		const normalized = skus
			.map((sku) => String(sku || "").trim())
			.filter(Boolean);
		if (normalized.length === 0) return [];

		const unique = Array.from(new Set(normalized));
		const placeholders = unique.map(() => "?").join(", ");
		const db = DbConn.getClient();
		const result = await db.execute({
			sql: `SELECT * FROM products WHERE store_id = ? AND deleted_at IS NULL AND sku IN (${placeholders})`,
			args: [ storeId, ...unique ],
		});
		return result.rows.map(ProductInterface.mapRow);
	}

	static async findByBarcodes(storeId: string, barcodes: string[]): Promise<Product[]> {
		await ProductInterface.ensureColumns();
		const normalized = barcodes
			.map((barcode) => String(barcode || "").trim())
			.filter(Boolean);
		if (normalized.length === 0) return [];

		const unique = Array.from(new Set(normalized));
		const placeholders = unique.map(() => "?").join(", ");
		const db = DbConn.getClient();
		const result = await db.execute({
			sql: `SELECT * FROM products WHERE store_id = ? AND deleted_at IS NULL AND barcode IN (${placeholders})`,
			args: [ storeId, ...unique ],
		});
		return result.rows.map(ProductInterface.mapRow);
	}

	static async importRows(storeId: string, rows: ProductImportRow[]): Promise<ProductImportResult> {
		await ProductInterface.ensureColumns();
		const db = DbConn.getClient();
		const skus = rows.map((row) => row.sku);
		const categoryIds = Array.from(new Set(rows.map((row) => row.category_id).filter((id): id is string => Boolean(id))));
		const unitIds = Array.from(new Set(rows.map((row) => row.base_unit_id)));
		const skuPlaceholders = skus.map(() => "?").join(", ");
		const categoryPlaceholders = categoryIds.map(() => "?").join(", ");
		const unitPlaceholders = unitIds.map(() => "?").join(", ");

		const [ existingResult, categoryResult, unitResult ] = await db.batch([
			{
				sql: `SELECT id, sku FROM products WHERE store_id = ? AND deleted_at IS NULL AND sku IN (${skuPlaceholders})`,
				args: [ storeId, ...skus ],
			},
			categoryIds.length > 0
				? {
					sql: `SELECT id FROM product_categories WHERE store_id = ? AND id IN (${categoryPlaceholders})`,
					args: [ storeId, ...categoryIds ],
				}
				: { sql: "SELECT id FROM product_categories WHERE 0", args: [] },
			{
				sql: `SELECT id FROM units WHERE store_id = ? AND id IN (${unitPlaceholders})`,
				args: [ storeId, ...unitIds ],
			},
		], "read");

		const existingBySku = new Map(
			existingResult.rows.map((row) => [ String(row.sku).trim().toUpperCase(), String(row.id) ]),
		);
		const validCategoryIds = new Set(categoryResult.rows.map((row) => String(row.id)));
		const validUnitIds = new Set(unitResult.rows.map((row) => String(row.id)));
		const missingCategoryIds = categoryIds.filter((id) => !validCategoryIds.has(id));
		const missingUnitIds = unitIds.filter((id) => !validUnitIds.has(id));

		if (missingCategoryIds.length > 0 || missingUnitIds.length > 0) {
			return {
				created: 0,
				updated: 0,
				total: rows.length,
				missingCategoryIds,
				missingUnitIds,
			};
		}

		const now = new Date().toISOString();
		let created = 0;
		let updated = 0;
		const statements = rows.map((row) => {
			const existingId = existingBySku.get(row.sku);
			if (existingId) {
				updated += 1;
				return {
					sql: `UPDATE products SET
						name = ?, barcode = ?, category_id = ?, base_unit_id = ?,
						price_base = ?, cost_base = ?, location = ?, low_stock_threshold = ?, updated_at = ?
					WHERE id = ? AND store_id = ? AND deleted_at IS NULL`,
					args: [
						row.name,
						row.barcode,
						row.category_id,
						row.base_unit_id,
						row.price_base,
						row.cost_base,
						row.location,
						row.low_stock_threshold,
						now,
						existingId,
						storeId,
					] as InValue[],
				};
			}

			created += 1;
			return {
				sql: `INSERT INTO products (
					id, store_id, sku, name, barcode, category_id, base_unit_id,
					price_base, cost_base, active, created_at, updated_at, out_stock_threshold,
					low_stock_threshold, allow_base_unit_sale, location
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 0, ?, 1, ?)`,
				args: [
					randomUUID(),
					storeId,
					row.sku,
					row.name,
					row.barcode,
					row.category_id,
					row.base_unit_id,
					row.price_base,
					row.cost_base,
					now,
					now,
					row.low_stock_threshold,
					row.location,
				] as InValue[],
			};
		});

		await db.batch(statements, "write");
		return {
			created,
			updated,
			total: rows.length,
			missingCategoryIds: [],
			missingUnitIds: [],
		};
	}

	static async findById(id: string): Promise<Product | null> {
		await ProductInterface.ensureColumns();
		return ProductInterface.findByIdInternal(id, false);
	}

	static async findByIdIncludingDeleted(id: string): Promise<Product | null> {
		await ProductInterface.ensureColumns();
		return ProductInterface.findByIdInternal(id, true);
	}

	private static async findByIdInternal(id: string, includeDeleted: boolean): Promise<Product | null> {
		const db = DbConn.getClient();
		const result = await db.execute({
			sql: includeDeleted
				? "SELECT * FROM products WHERE id = ? LIMIT 1"
				: "SELECT * FROM products WHERE id = ? AND deleted_at IS NULL LIMIT 1",
			args: [ id ],
		});

		if (result.rows.length === 0) return null;
		return ProductInterface.mapRow(result.rows[0]);
	}

	static async create(payload: CreateProductInput): Promise<Product> {
		await ProductInterface.ensureColumns();
		const db = DbConn.getClient();
		const insertPayload = getInsertPayload(payload);
		const now = new Date().toISOString();
		if (!insertPayload.created_at) insertPayload.created_at = now;
		insertPayload.updated_at = now;
		const id = String(insertPayload.id);
		const keys = Object.keys(insertPayload);
		const values = Object.values(insertPayload);
		const placeholders = keys.map(() => "?").join(", ");

		await db.execute({
			sql: `INSERT INTO products (${keys.join(", ")}) VALUES (${placeholders})`,
			args: values,
		});

		const created = await ProductInterface.findById(id);
		if (!created) throw new Error("Failed to create product");

		return created;
	}

	// Every quantity and money column on a product is denominated in its base
	// unit, and none of them are rewritten when the unit changes. Swapping the
	// unit is therefore only safe while the product has no history at all.
	static async checkBaseUnitChange(id: string): Promise<ProductBaseUnitCheck> {
		await ProductInterface.ensureColumns();
		const db = DbConn.getClient();

		const result = await db.batch([
			{ sql: "SELECT COALESCE(on_hand_base, 0) AS total FROM inventory_balances WHERE product_id = ?", args: [ id ] },
			{ sql: "SELECT COUNT(*) AS total FROM inventory_movements WHERE product_id = ?", args: [ id ] },
			{ sql: "SELECT COUNT(*) AS total FROM order_items WHERE product_id = ?", args: [ id ] },
			{ sql: "SELECT COUNT(*) AS total FROM purchase_order_items WHERE product_id = ?", args: [ id ] },
			{ sql: "SELECT COUNT(*) AS total FROM product_units WHERE product_id = ?", args: [ id ] },
		], "read");

		const readTotal = (index: number) => Number(result[index]?.rows[0]?.total || 0);
		const counts = {
			stock_on_hand: readTotal(0),
			inventory_movements: readTotal(1),
			order_items: readTotal(2),
			purchase_order_items: readTotal(3),
			extra_units: readTotal(4),
		};

		const reasons: string[] = [];
		if (counts.stock_on_hand !== 0) reasons.push(`ສິນຄ້ານີ້ຍັງມີສະຕັອກຄົງເຫຼືອ ${counts.stock_on_hand}`);
		if (counts.inventory_movements > 0) reasons.push(`ມີປະຫວັດການເຄື່ອນໄຫວສະຕັອກແລ້ວ ${counts.inventory_movements} ລາຍການ`);
		if (counts.order_items > 0) reasons.push(`ຖືກຂາຍໄປແລ້ວ ${counts.order_items} ລາຍການ`);
		if (counts.purchase_order_items > 0) reasons.push(`ຢູ່ໃນໃບສັ່ງຊື້ແລ້ວ ${counts.purchase_order_items} ລາຍການ`);
		if (counts.extra_units > 0) reasons.push(`ມີຫົວໜ່ວຍຂາຍເພີ່ມທີ່ອ້າງອີງຫົວໜ່ວຍຫຼັກ ${counts.extra_units} ລາຍການ`);

		return { product_id: id, can_change: reasons.length === 0, counts, reasons };
	}

	static async update(id: string, data: UpdateProductInput): Promise<Product> {
		await ProductInterface.ensureColumns();
		const updatePayload = getUpdatePayload(data);
		if (Object.keys(updatePayload).length === 0) {
			throw new Error("No data to update");
		}
		(updatePayload as Record<string, InValue>).updated_at = new Date().toISOString();
		const keys = Object.keys(updatePayload) as ProductWritableKey[];
		const values = Object.values(updatePayload);

		const setClause = keys.map((key) => `${key} = ?`).join(", ");
		const db = DbConn.getClient();

		await db.execute({
			sql: `UPDATE products SET ${setClause} WHERE id = ?`,
			args: [ ...values, id ],
		});

		const updated = await ProductInterface.findById(id);
		if (!updated) throw new Error("Product not found");

		return updated;
	}

	static async delete(id: string): Promise<boolean> {
		await ProductInterface.ensureColumns();
		const db = DbConn.getClient();
		const existing = await ProductInterface.findByIdIncludingDeleted(id);
		if (!existing) return false;
		if ((existing as unknown as { deleted_at?: string | null }).deleted_at) return false;

		await db.execute({
			sql: "UPDATE products SET deleted_at = ? WHERE id = ?",
			args: [ new Date().toISOString(), id ],
		});

		return true;
	}

	private static mapRow(row: Record<string, unknown>): Product {
		return row as unknown as Product;
	}
}
