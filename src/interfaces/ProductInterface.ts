import { randomUUID } from "crypto";

import { InValue } from "@libsql/client";

import { DbConn } from "@connections/DbConn";
import { CreateProductInput, Product, UpdateProductInput } from "@models/Product";

type ProductWritableKey = Exclude<keyof Product, "id">;

const PRODUCT_OPTIONAL_COLUMNS = [
	{
		name: "deleted_at",
		sql: "ALTER TABLE products ADD COLUMN deleted_at TEXT",
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
