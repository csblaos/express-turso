import { randomUUID } from "crypto";

import { InValue } from "@libsql/client";

import { DbConn } from "@connections/DbConn";
import { CreateProductModelInput, ProductModel, UpdateProductModelInput } from "@models/ProductModel";

type ProductModelWritableKey = Exclude<keyof ProductModel, "id">;

function getInsertPayload(payload: CreateProductModelInput): Record<string, InValue> {
	const result: Record<string, InValue> = {
		id: payload.id || randomUUID(),
	};

	for (const [ key, value ] of Object.entries(payload)) {
		if (key === "id") continue;
		if (value === undefined) continue;
		result[key] = value as InValue;
	}

	return result;
}

function getUpdatePayload(data: UpdateProductModelInput): Record<string, InValue> {
	const result: Record<string, InValue> = {};

	for (const [ key, value ] of Object.entries(data)) {
		if (key === "id") continue;
		if (value === undefined) continue;
		result[key] = value as InValue;
	}

	return result;
}

export class ProductModelInterface {
	static async findById(id: string): Promise<ProductModel | null> {
		const db = DbConn.getClient();
		const result = await db.execute({
			sql: "SELECT * FROM product_models WHERE id = ? LIMIT 1",
			args: [ id ],
		});
		if (result.rows.length === 0) return null;
		return result.rows[0] as unknown as ProductModel;
	}

	static async create(payload: CreateProductModelInput): Promise<ProductModel> {
		const db = DbConn.getClient();
		const insertPayload = getInsertPayload(payload);
		const id = String(insertPayload.id);
		const keys = Object.keys(insertPayload);
		const values = Object.values(insertPayload);
		const placeholders = keys.map(() => "?").join(", ");

		await db.execute({
			sql: `INSERT INTO product_models (${keys.join(", ")}) VALUES (${placeholders})`,
			args: values,
		});

		const created = await ProductModelInterface.findById(id);
		if (!created) throw new Error("Failed to create product model");
		return created;
	}

	static async update(id: string, data: UpdateProductModelInput): Promise<ProductModel> {
		const updatePayload = getUpdatePayload(data);
		const keys = Object.keys(updatePayload) as ProductModelWritableKey[];
		const values = Object.values(updatePayload);

		if (keys.length === 0) {
			throw new Error("No data to update");
		}

		const setClause = keys.map((key) => `${key} = ?`).join(", ");
		const db = DbConn.getClient();

		await db.execute({
			sql: `UPDATE product_models SET ${setClause} WHERE id = ?`,
			args: [ ...values, id ],
		});

		const updated = await ProductModelInterface.findById(id);
		if (!updated) throw new Error("Product model not found");
		return updated;
	}
}

