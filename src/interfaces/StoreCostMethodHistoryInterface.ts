import { InValue } from "@libsql/client";
import { randomUUID } from "crypto";

import { DbConn } from "@connections/DbConn";

export type StoreCostMethodHistoryRow = {
	id: string;
	store_id: string;
	cost_method: string;
	actor_user_id: string | null;
	occurred_at: string;
};

export class StoreCostMethodHistoryInterface {
	private static initialized = false;

	private static async ensureTable(): Promise<void> {
		if (StoreCostMethodHistoryInterface.initialized) return;
		const db = DbConn.getClient();

		await db.execute(`
			CREATE TABLE IF NOT EXISTS store_cost_method_history (
				id TEXT PRIMARY KEY,
				store_id TEXT NOT NULL,
				cost_method TEXT NOT NULL,
				actor_user_id TEXT,
				occurred_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
			)
		`);

		await db.execute("CREATE INDEX IF NOT EXISTS idx_store_cost_method_history_store ON store_cost_method_history (store_id, occurred_at DESC)");
		StoreCostMethodHistoryInterface.initialized = true;
	}

	static async warmup(): Promise<void> {
		await StoreCostMethodHistoryInterface.ensureTable();
	}

	static async findByStoreId(storeId: string, options: { limit: number }): Promise<StoreCostMethodHistoryRow[]> {
		await StoreCostMethodHistoryInterface.ensureTable();
		const db = DbConn.getClient();
		const limit = Math.min(Math.max(options.limit || 50, 1), 200);
		const result = await db.execute({
			sql: `
				SELECT
					id,
					store_id,
					cost_method,
					actor_user_id,
					occurred_at
				FROM store_cost_method_history
				WHERE store_id = ?
				ORDER BY occurred_at DESC
				LIMIT ?
			`,
			args: [ storeId, limit ] as InValue[],
		});

		return result.rows.map((row) => ({
			id: String(row.id),
			store_id: String(row.store_id),
			cost_method: String(row.cost_method),
			actor_user_id: row.actor_user_id ? String(row.actor_user_id) : null,
			occurred_at: String(row.occurred_at),
		}));
	}

	static async insert(
		item: {
			store_id: string;
			cost_method: string;
			actor_user_id?: string | null;
			occurred_at?: string;
		},
		executor?: Pick<ReturnType<typeof DbConn.getClient>, "execute">,
	): Promise<void> {
		await StoreCostMethodHistoryInterface.ensureTable();
		const db = executor || DbConn.getClient();
		await db.execute({
			sql: `
				INSERT INTO store_cost_method_history (
					id,
					store_id,
					cost_method,
					actor_user_id,
					occurred_at
				) VALUES (?, ?, ?, ?, ?)
			`,
			args: [
				randomUUID(),
				item.store_id,
				item.cost_method,
				item.actor_user_id ?? null,
				item.occurred_at ?? new Date().toISOString(),
			] as InValue[],
		});
	}
}
