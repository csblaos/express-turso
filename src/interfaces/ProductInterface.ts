import { randomUUID } from "crypto";

import { InValue } from "@libsql/client";

import { DbConn } from "@connections/DbConn";
import { CreateProductInput, Product, UpdateProductInput } from "@models/Product";

type ProductWritableKey = Exclude<keyof Product, "id">;

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
	static async findAll(storeId?: string): Promise<Product[]> {
		const db = DbConn.getClient();

		if (storeId) {
			const result = await db.execute({
				sql: "SELECT * FROM products WHERE store_id = ? ORDER BY created_at DESC",
				args: [ storeId ],
			});
			return result.rows.map(ProductInterface.mapRow);
		}

		const result = await db.execute("SELECT * FROM products ORDER BY created_at DESC");
		return result.rows.map(ProductInterface.mapRow);
	}

	static async findById(id: string): Promise<Product | null> {
		const db = DbConn.getClient();
		const result = await db.execute({
			sql: "SELECT * FROM products WHERE id = ? LIMIT 1",
			args: [ id ],
		});

		if (result.rows.length === 0) return null;
		return ProductInterface.mapRow(result.rows[0]);
	}

	static async create(payload: CreateProductInput): Promise<Product> {
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
		const db = DbConn.getClient();
		const existing = await ProductInterface.findById(id);
		if (!existing) return false;

		await db.execute({
			sql: "DELETE FROM products WHERE id = ?",
			args: [ id ],
		});

		return true;
	}

	private static mapRow(row: Record<string, unknown>): Product {
		return row as unknown as Product;
	}
}
