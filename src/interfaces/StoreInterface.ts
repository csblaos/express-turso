import { randomUUID } from "crypto";

import { InValue } from "@libsql/client";

import { DbConn } from "@connections/DbConn";
import { CreateStoreInput, Store } from "@models/Store";

export class StoreInterface {
	// Backward-compatible alias for older callers.
	static async ensureOwnerColumn(): Promise<void> {
		await StoreInterface.ensureColumns();
	}

	static async ensureColumns(): Promise<void> {
		const db = DbConn.getClient();
		const pragmaResult = await db.execute("PRAGMA table_info(stores)");
		const existingColumns = new Set(
			pragmaResult.rows.map((row) => String(row.name || "")),
		);

		if (!existingColumns.has("owner_user_id")) {
			await db.execute("ALTER TABLE stores ADD COLUMN owner_user_id TEXT");
		}

		if (!existingColumns.has("allow_negative_stock")) {
			await db.execute("ALTER TABLE stores ADD COLUMN allow_negative_stock INTEGER NOT NULL DEFAULT 0");
		}

		if (!existingColumns.has("cost_method")) {
			await db.execute("ALTER TABLE stores ADD COLUMN cost_method TEXT NOT NULL DEFAULT 'average'");
		}
	}

	static async findAll(ownerUserId?: string): Promise<Store[]> {
		await StoreInterface.ensureColumns();
		const db = DbConn.getClient();
		const result = ownerUserId
			? await db.execute({
				sql: "SELECT * FROM stores WHERE owner_user_id = ? ORDER BY created_at DESC",
				args: [ ownerUserId ],
			})
			: await db.execute("SELECT * FROM stores ORDER BY created_at DESC");
		return result.rows.map(StoreInterface.mapRow);
	}

	static async findById(id: string, executor?: Pick<ReturnType<typeof DbConn.getClient>, "execute">): Promise<Store | null> {
		await StoreInterface.ensureColumns();
		const db = executor || DbConn.getClient();
		const result = await db.execute({
			sql: "SELECT * FROM stores WHERE id = ? LIMIT 1",
			args: [ id ],
		});

		if (result.rows.length === 0) return null;
		return StoreInterface.mapRow(result.rows[0]);
	}

	static async countByOwnerUserId(ownerUserId: string): Promise<number> {
		await StoreInterface.ensureColumns();
		const db = DbConn.getClient();
		const result = await db.execute({
			sql: "SELECT COUNT(*) AS total FROM stores WHERE owner_user_id = ?",
			args: [ ownerUserId ],
		});

		return Number(result.rows[0]?.total || 0);
	}

	static async create(payload: CreateStoreInput): Promise<Store> {
		await StoreInterface.ensureColumns();
		const db = DbConn.getClient();
		const id = randomUUID();
		const insertPayload: Record<string, InValue> = {
			id,
			name: payload.name,
		};

		for (const [ key, value ] of Object.entries(payload)) {
			if (key === "id" || key === "name") continue;
			if (value === undefined) continue;
			insertPayload[key] = value as InValue;
		}

		const columns = Object.keys(insertPayload);
		const placeholders = columns.map(() => "?").join(", ");
		const values = columns.map((column) => insertPayload[column]);

		await db.execute({
			sql: `INSERT INTO stores (${columns.join(", ")}) VALUES (${placeholders})`,
			args: values,
		});

		const created = await StoreInterface.findById(id);
		if (!created) throw new Error("Failed to create store");

		return created;
	}

	static async update(
		id: string,
		data: Partial<Store>,
		executor?: Pick<ReturnType<typeof DbConn.getClient>, "execute">,
	): Promise<Store> {
		await StoreInterface.ensureColumns();
		const keys = Object.keys(data);
		const values = Object.values(data);

		if (keys.length === 0) {
			throw new Error("No data to update");
		}

		const setClause = keys.map((key) => `${key} = ?`).join(", ");

		const db = executor || DbConn.getClient();
		await db.execute({
			sql: `UPDATE stores SET ${setClause} WHERE id = ?`,
			args: [ ...values, id ],
		});

		const updated = await StoreInterface.findById(id, executor);
		if (!updated) throw new Error("Store not found");

		return updated;
	}

	static async delete(id: string): Promise<boolean> {
		await StoreInterface.ensureColumns();
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
		return {
			...(row as unknown as Store),
			owner_user_id: row.owner_user_id ? String(row.owner_user_id) : null,
		};
	}
}
