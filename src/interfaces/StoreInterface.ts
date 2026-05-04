import { randomUUID } from "crypto";

import { DbConn } from "@connections/DbConn";
import { CreateStoreInput, Store } from "@models/Store";

export class StoreInterface {
	static async findAll(): Promise<Store[]> {
		const db = DbConn.getClient();
		const result = await db.execute("SELECT * FROM stores ORDER BY created_at DESC");
		return result.rows.map(StoreInterface.mapRow);
	}

	static async findById(id: string): Promise<Store | null> {
		const db = DbConn.getClient();
		const result = await db.execute({
			sql: "SELECT * FROM stores WHERE id = ? LIMIT 1",
			args: [ id ],
		});

		if (result.rows.length === 0) return null;
		return StoreInterface.mapRow(result.rows[0]);
	}

	static async create(payload: CreateStoreInput): Promise<Store> {
		const db = DbConn.getClient();
		const id = randomUUID();

		await db.execute({
			sql: "INSERT INTO stores (id, name) VALUES (?, ?)",
			args: [ id, payload.name ],
		});

		const created = await StoreInterface.findById(id);
		if (!created) throw new Error("Failed to create store");

		return created;
	}

	static async update(id: string, data: Partial<Store>): Promise<Store> {
		const keys = Object.keys(data);
		const values = Object.values(data);

		if (keys.length === 0) {
			throw new Error("No data to update");
		}

		const setClause = keys.map((key) => `${key} = ?`).join(", ");

		const db = DbConn.getClient();
		await db.execute({
			sql: `UPDATE stores SET ${setClause} WHERE id = ?`,
			args: [ ...values, id ],
		});

		const updated = await StoreInterface.findById(id);
		if (!updated) throw new Error("Store not found");

		return updated;
	}

	static async delete(id: string): Promise<boolean> {
		const db = DbConn.getClient();
		const existing = await StoreInterface.findById(id);
		if (!existing) return false;

		await db.execute({
			sql: "DELETE FROM stores WHERE id = ?",
			args: [ id ],
		});

		return true;
	}

	private static mapRow(row: Record<string, unknown>): Store {
		return row as unknown as Store;
	}
}
