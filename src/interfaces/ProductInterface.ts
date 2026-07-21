import { randomUUID } from "crypto";

import { InValue } from "@libsql/client";

import { DbConn } from "@connections/DbConn";
import { CreateProductInput, Product, UpdateProductInput } from "@models/Product";

type ProductWritableKey = Exclude<keyof Product, "id">;

export type ProductListItem = Product & {
	category_name: string | null;
	base_unit_name: string | null;
	extra_sale_unit_count: number;
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

const PRODUCT_OPTIONAL_COLUMNS = [
	{
		name: "deleted_at",
		sql: "ALTER TABLE products ADD COLUMN deleted_at TEXT",
	},
	{
		name: "location",
		sql: "ALTER TABLE products ADD COLUMN location TEXT",
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

		const [itemsResult, countResult, statsResult, categoriesResult] = await Promise.all([
			db.execute({
				sql: `SELECT p.*,
					pc.name AS category_name,
					COALESCE(u.name_th, u.code) AS base_unit_name,
					(SELECT COUNT(DISTINCT pu.unit_id) FROM product_units pu WHERE pu.product_id = p.id AND pu.enabled_for_sale = 1) AS extra_sale_unit_count
				FROM products p
				LEFT JOIN product_categories pc ON pc.id = p.category_id
				LEFT JOIN units u ON u.id = p.base_unit_id
				WHERE ${where}
				ORDER BY ${orderBy}
				LIMIT ? OFFSET ?`,
				args: [ ...args, limit, offset ],
			}),
			db.execute({ sql: `SELECT COUNT(*) AS total FROM products p WHERE ${where}`, args }),
			db.execute({
				sql: `SELECT
					COUNT(*) AS total,
					SUM(CASE WHEN p.active = 1 THEN 1 ELSE 0 END) AS active,
					SUM(CASE WHEN p.active = 0 THEN 1 ELSE 0 END) AS inactive,
					SUM(CASE WHEN p.active = 1 AND COALESCE(p.low_stock_threshold, 0) > 0 THEN 1 ELSE 0 END) AS low_stock
				FROM products p WHERE p.deleted_at IS NULL${input.storeId ? " AND p.store_id = ?" : ""}`,
				args: input.storeId ? [ input.storeId ] : [],
			}),
			db.execute({
				sql: `SELECT COALESCE(p.category_id, 'uncategorized') AS category_id, COUNT(*) AS total
				FROM products p WHERE p.deleted_at IS NULL${input.storeId ? " AND p.store_id = ?" : ""}
				GROUP BY COALESCE(p.category_id, 'uncategorized')`,
				args: input.storeId ? [ input.storeId ] : [],
			}),
		]);

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

	static async update(id: string, data: UpdateProductInput): Promise<Product> {
		await ProductInterface.ensureColumns();
		const updatePayload = getUpdatePayload(data);
		const keys = Object.keys(updatePayload) as ProductWritableKey[];
		const values = Object.values(updatePayload);

		if (keys.length === 0) {
			throw new Error("No data to update");
		}

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
