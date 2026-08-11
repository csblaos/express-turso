import { randomUUID } from "crypto";

import { InValue } from "@libsql/client";

import { DbConn } from "@connections/DbConn";
import {
	CreateProductCategoryInput,
	ProductCategory,
	UpdateProductCategoryInput,
} from "@models/ProductCategory";

type ProductCategoryWritableKey = Exclude<keyof ProductCategory, "id">;

function getInsertPayload(payload: CreateProductCategoryInput): Record<string, InValue> {
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

function getUpdatePayload(data: UpdateProductCategoryInput): Record<string, InValue> {
	const result: Record<string, InValue> = {};

	for (const [ key, value ] of Object.entries(data)) {
		if (key === "id") continue;
		if (value === undefined) continue;
		result[key] = value;
	}

	return result;
}

export class ProductCategoryInterface {
	private static ensured = false;
	private static ensureColumnsPromise: Promise<void> | null = null;

	/** The kitchen station a category is cooked at. Held on the category rather
	 * than the product because a menu is grouped the way the kitchen is laid out:
	 * one assignment covers every dish on the grill. */
	static async ensureColumns(): Promise<void> {
		if (ProductCategoryInterface.ensured) return;
		if (ProductCategoryInterface.ensureColumnsPromise) return ProductCategoryInterface.ensureColumnsPromise;

		ProductCategoryInterface.ensureColumnsPromise = (async () => {
			const db = DbConn.getClient();
			const pragmaResult = await db.execute("PRAGMA table_info(product_categories)");
			const existingColumns = new Set(pragmaResult.rows.map((row) => String(row.name || "")));
			if (!existingColumns.has("station_id")) {
				await db.execute("ALTER TABLE product_categories ADD COLUMN station_id TEXT");
			}
			// Drinks taken from a fridge at the counter are sold and stocked like
			// anything else; they simply have no reason to appear on a kitchen slip.
			if (!existingColumns.has("send_to_kitchen")) {
				await db.execute("ALTER TABLE product_categories ADD COLUMN send_to_kitchen INTEGER NOT NULL DEFAULT 1");
			}
			ProductCategoryInterface.ensured = true;
		})().catch((error) => {
			ProductCategoryInterface.ensureColumnsPromise = null;
			throw error;
		});

		return ProductCategoryInterface.ensureColumnsPromise;
	}

	static async findAll(storeId?: string): Promise<ProductCategory[]> {
		await ProductCategoryInterface.ensureColumns();
		const db = DbConn.getClient();

		if (storeId) {
			const result = await db.execute({
				sql: "SELECT * FROM product_categories WHERE store_id = ? ORDER BY sort_order ASC, created_at DESC",
				args: [ storeId ],
			});
			return result.rows.map(ProductCategoryInterface.mapRow);
		}

		const result = await db.execute("SELECT * FROM product_categories ORDER BY sort_order ASC, created_at DESC");
		return result.rows.map(ProductCategoryInterface.mapRow);
	}

	static async findById(id: string): Promise<ProductCategory | null> {
		const db = DbConn.getClient();
		const result = await db.execute({
			sql: "SELECT * FROM product_categories WHERE id = ? LIMIT 1",
			args: [ id ],
		});

		if (result.rows.length === 0) return null;
		return ProductCategoryInterface.mapRow(result.rows[0]);
	}

	static async create(payload: CreateProductCategoryInput): Promise<ProductCategory> {
		const db = DbConn.getClient();
		const insertPayload = getInsertPayload(payload);
		const id = String(insertPayload.id);
		const keys = Object.keys(insertPayload);
		const values = Object.values(insertPayload);
		const placeholders = keys.map(() => "?").join(", ");

		await db.execute({
			sql: `INSERT INTO product_categories (${keys.join(", ")}) VALUES (${placeholders})`,
			args: values,
		});

		const created = await ProductCategoryInterface.findById(id);
		if (!created) throw new Error("Failed to create product category");

		return created;
	}

	static async update(id: string, data: UpdateProductCategoryInput): Promise<ProductCategory> {
		const updatePayload = getUpdatePayload(data);
		const keys = Object.keys(updatePayload) as ProductCategoryWritableKey[];
		const values = Object.values(updatePayload);

		if (keys.length === 0) {
			throw new Error("No data to update");
		}

		const setClause = keys.map((key) => `${key} = ?`).join(", ");
		const db = DbConn.getClient();

		await db.execute({
			sql: `UPDATE product_categories SET ${setClause} WHERE id = ?`,
			args: [ ...values, id ],
		});

		const updated = await ProductCategoryInterface.findById(id);
		if (!updated) throw new Error("Product category not found");

		return updated;
	}

	static async delete(id: string): Promise<boolean> {
		const db = DbConn.getClient();
		const existing = await ProductCategoryInterface.findById(id);
		if (!existing) return false;

		await db.execute({
			sql: "DELETE FROM product_categories WHERE id = ?",
			args: [ id ],
		});

		return true;
	}

	private static mapRow(row: Record<string, unknown>): ProductCategory {
		return row as unknown as ProductCategory;
	}
}
