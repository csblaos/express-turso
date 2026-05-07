import { randomUUID } from "crypto";

import { InValue } from "@libsql/client";

import { DbConn } from "@connections/DbConn";
import {
	CreateProductUnitInput,
	ProductUnit,
	UpdateProductUnitInput,
} from "@models/ProductUnit";

type ProductUnitWritableKey = Exclude<keyof ProductUnit, "id">;

function getInsertPayload(payload: CreateProductUnitInput): Record<string, InValue> {
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

function getUpdatePayload(data: UpdateProductUnitInput): Record<string, InValue> {
	const result: Record<string, InValue> = {};

	for (const [ key, value ] of Object.entries(data)) {
		if (key === "id") continue;
		if (value === undefined) continue;
		result[key] = value;
	}

	return result;
}

export class ProductUnitInterface {
	static async findAll(filters?: { productId?: string; unitId?: string }): Promise<ProductUnit[]> {
		const db = DbConn.getClient();

		if (filters?.productId && filters?.unitId) {
			const result = await db.execute({
				sql: "SELECT * FROM product_units WHERE product_id = ? AND unit_id = ? ORDER BY multiplier_to_base ASC",
				args: [ filters.productId, filters.unitId ],
			});
			return result.rows.map(ProductUnitInterface.mapRow);
		}

		if (filters?.productId) {
			const result = await db.execute({
				sql: "SELECT * FROM product_units WHERE product_id = ? ORDER BY multiplier_to_base ASC",
				args: [ filters.productId ],
			});
			return result.rows.map(ProductUnitInterface.mapRow);
		}

		if (filters?.unitId) {
			const result = await db.execute({
				sql: "SELECT * FROM product_units WHERE unit_id = ? ORDER BY multiplier_to_base ASC",
				args: [ filters.unitId ],
			});
			return result.rows.map(ProductUnitInterface.mapRow);
		}

		const result = await db.execute("SELECT * FROM product_units ORDER BY multiplier_to_base ASC");
		return result.rows.map(ProductUnitInterface.mapRow);
	}

	static async findById(id: string): Promise<ProductUnit | null> {
		const db = DbConn.getClient();
		const result = await db.execute({
			sql: "SELECT * FROM product_units WHERE id = ? LIMIT 1",
			args: [ id ],
		});

		if (result.rows.length === 0) return null;
		return ProductUnitInterface.mapRow(result.rows[0]);
	}

	static async findByProductAndUnit(productId: string, unitId: string): Promise<ProductUnit | null> {
		const db = DbConn.getClient();
		const result = await db.execute({
			sql: "SELECT * FROM product_units WHERE product_id = ? AND unit_id = ? LIMIT 1",
			args: [ productId, unitId ],
		});

		if (result.rows.length === 0) return null;
		return ProductUnitInterface.mapRow(result.rows[0]);
	}

	static async create(payload: CreateProductUnitInput): Promise<ProductUnit> {
		const db = DbConn.getClient();
		const insertPayload = getInsertPayload(payload);
		const id = String(insertPayload.id);
		const keys = Object.keys(insertPayload);
		const values = Object.values(insertPayload);
		const placeholders = keys.map(() => "?").join(", ");

		await db.execute({
			sql: `INSERT INTO product_units (${keys.join(", ")}) VALUES (${placeholders})`,
			args: values,
		});

		const created = await ProductUnitInterface.findById(id);
		if (!created) throw new Error("Failed to create product unit");

		return created;
	}

	static async update(id: string, data: UpdateProductUnitInput): Promise<ProductUnit> {
		const updatePayload = getUpdatePayload(data);
		const keys = Object.keys(updatePayload) as ProductUnitWritableKey[];
		const values = Object.values(updatePayload);

		if (keys.length === 0) {
			throw new Error("No data to update");
		}

		const setClause = keys.map((key) => `${key} = ?`).join(", ");
		const db = DbConn.getClient();

		await db.execute({
			sql: `UPDATE product_units SET ${setClause} WHERE id = ?`,
			args: [ ...values, id ],
		});

		const updated = await ProductUnitInterface.findById(id);
		if (!updated) throw new Error("Product unit not found");

		return updated;
	}

	static async delete(id: string): Promise<boolean> {
		const db = DbConn.getClient();
		const existing = await ProductUnitInterface.findById(id);
		if (!existing) return false;

		await db.execute({
			sql: "DELETE FROM product_units WHERE id = ?",
			args: [ id ],
		});

		return true;
	}

	private static mapRow(row: Record<string, unknown>): ProductUnit {
		return row as unknown as ProductUnit;
	}
}
