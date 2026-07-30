import { randomUUID } from "crypto";

import { InValue } from "@libsql/client";

import { DbConn } from "@connections/DbConn";
import { CreateStoreInput, Store } from "@models/Store";

export type StoreAccessActor = {
	userId: string;
	systemRole: string;
};

export class StoreInterface {
	private static columnsEnsured = false;
	private static ensureColumnsPromise: Promise<void> | null = null;

	// Backward-compatible alias for older callers.
	static async ensureOwnerColumn(): Promise<void> {
		await StoreInterface.ensureColumns();
	}

	static async ensureColumns(): Promise<void> {
		if (StoreInterface.columnsEnsured) return;
		if (StoreInterface.ensureColumnsPromise) return StoreInterface.ensureColumnsPromise;

		StoreInterface.ensureColumnsPromise = (async () => {
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

			if (!existingColumns.has("receipt_show_store_address")) {
				await db.execute("ALTER TABLE stores ADD COLUMN receipt_show_store_address INTEGER NOT NULL DEFAULT 1");
			}

			if (!existingColumns.has("receipt_show_store_phone")) {
				await db.execute("ALTER TABLE stores ADD COLUMN receipt_show_store_phone INTEGER NOT NULL DEFAULT 1");
			}

			if (!existingColumns.has("receipt_show_tendered")) {
				await db.execute("ALTER TABLE stores ADD COLUMN receipt_show_tendered INTEGER NOT NULL DEFAULT 1");
			}

			if (!existingColumns.has("receipt_show_change")) {
				await db.execute("ALTER TABLE stores ADD COLUMN receipt_show_change INTEGER NOT NULL DEFAULT 1");
			}

			if (!existingColumns.has("receipt_show_payment_method")) {
				await db.execute("ALTER TABLE stores ADD COLUMN receipt_show_payment_method INTEGER NOT NULL DEFAULT 1");
			}

			if (!existingColumns.has("receipt_show_queue")) {
				await db.execute("ALTER TABLE stores ADD COLUMN receipt_show_queue INTEGER NOT NULL DEFAULT 1");
			}

			if (!existingColumns.has("pickup_queue_enabled")) {
				await db.execute("ALTER TABLE stores ADD COLUMN pickup_queue_enabled INTEGER NOT NULL DEFAULT 0");
			}

			if (!existingColumns.has("business_day_start_minutes")) {
				await db.execute("ALTER TABLE stores ADD COLUMN business_day_start_minutes INTEGER NOT NULL DEFAULT 0");
			}

			await db.execute("CREATE INDEX IF NOT EXISTS idx_stores_owner_created ON stores (owner_user_id, created_at DESC)");
			StoreInterface.columnsEnsured = true;
		})().catch((error) => {
			StoreInterface.ensureColumnsPromise = null;
			throw error;
		});

		return StoreInterface.ensureColumnsPromise;
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

	static async findAccessible(actor: StoreAccessActor): Promise<Store[]> {
		await StoreInterface.ensureColumns();
		const db = DbConn.getClient();

		if (actor.systemRole === "system_admin") {
			return StoreInterface.findAll();
		}

		const membershipExists = `EXISTS (
			SELECT 1
			FROM store_members sm
			WHERE sm.store_id = s.id
				AND sm.user_id = ?
				AND sm.status = 'active'
		)`;
		const result = actor.systemRole === "superadmin"
			? await db.execute({
				sql: `
					SELECT s.*
					FROM stores s
					WHERE s.owner_user_id = ? OR ${membershipExists}
					ORDER BY s.created_at DESC
				`,
				args: [ actor.userId, actor.userId ],
			})
			: await db.execute({
				sql: `
					SELECT s.*
					FROM stores s
					WHERE ${membershipExists}
					ORDER BY s.created_at DESC
				`,
				args: [ actor.userId ],
			});

		return result.rows.map(StoreInterface.mapRow);
	}

	static async findAccessibleById(id: string, actor: StoreAccessActor): Promise<Store | null> {
		await StoreInterface.ensureColumns();
		const db = DbConn.getClient();
		const conditions = [ "s.id = ?" ];
		const args: InValue[] = [ id ];

		if (actor.systemRole === "superadmin") {
			conditions.push(`(s.owner_user_id = ? OR EXISTS (
				SELECT 1 FROM store_members sm
				WHERE sm.store_id = s.id AND sm.user_id = ? AND sm.status = 'active'
			))`);
			args.push(actor.userId, actor.userId);
		} else if (actor.systemRole !== "system_admin") {
			conditions.push(`EXISTS (
				SELECT 1 FROM store_members sm
				WHERE sm.store_id = s.id AND sm.user_id = ? AND sm.status = 'active'
			)`);
			args.push(actor.userId);
		}

		const result = await db.execute({
			sql: `SELECT s.* FROM stores s WHERE ${conditions.join(" AND ")} LIMIT 1`,
			args,
		});
		return result.rows[0] ? StoreInterface.mapRow(result.rows[0]) : null;
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
		const result = await db.execute({
			sql: "DELETE FROM stores WHERE id = ?",
			args: [ id ],
		});

		return result.rowsAffected > 0;
	}

	private static mapRow(row: Record<string, unknown>): Store {
		return {
			...(row as unknown as Store),
			owner_user_id: row.owner_user_id ? String(row.owner_user_id) : null,
		};
	}
}
