import { InValue } from "@libsql/client";
import { randomUUID } from "crypto";

import { DbConn } from "@connections/DbConn";

export type StoreCurrencyRateHistoryRow = {
	id: string;
	store_id: string;
	base_currency: string;
	currency: string;
	rate_to_base: number;
	actor_user_id: string | null;
	occurred_at: string;
};

export class StoreCurrencyRateHistoryInterface {
	private static initialized = false;

	private static async ensureTable(): Promise<void> {
		if (StoreCurrencyRateHistoryInterface.initialized) return;
		const db = DbConn.getClient();

		await db.execute(`
			CREATE TABLE IF NOT EXISTS store_currency_rate_history (
				id TEXT PRIMARY KEY,
				store_id TEXT NOT NULL,
				base_currency TEXT NOT NULL,
				currency TEXT NOT NULL,
				rate_to_base REAL NOT NULL,
				actor_user_id TEXT,
				occurred_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
			)
		`);

		await db.execute("CREATE INDEX IF NOT EXISTS idx_store_currency_rate_history_store ON store_currency_rate_history (store_id, occurred_at DESC)");
		await db.execute("CREATE INDEX IF NOT EXISTS idx_store_currency_rate_history_currency ON store_currency_rate_history (store_id, currency, occurred_at DESC)");
		StoreCurrencyRateHistoryInterface.initialized = true;
	}

	static async warmup(): Promise<void> {
		await StoreCurrencyRateHistoryInterface.ensureTable();
	}

	static async findByStoreId(storeId: string, options: { limit: number }): Promise<StoreCurrencyRateHistoryRow[]> {
		await StoreCurrencyRateHistoryInterface.ensureTable();
		const db = DbConn.getClient();
		const limit = Math.min(Math.max(options.limit || 50, 1), 200);
		const result = await db.execute({
			sql: `
				SELECT
					id,
					store_id,
					base_currency,
					currency,
					rate_to_base,
					actor_user_id,
					occurred_at
				FROM store_currency_rate_history
				WHERE store_id = ?
				ORDER BY occurred_at DESC
				LIMIT ?
			`,
			args: [ storeId, limit ] as InValue[],
		});

		return result.rows.map((row) => ({
			id: String(row.id),
			store_id: String(row.store_id),
			base_currency: String(row.base_currency),
			currency: String(row.currency),
			rate_to_base: Number(row.rate_to_base ?? 1),
			actor_user_id: row.actor_user_id ? String(row.actor_user_id) : null,
			occurred_at: String(row.occurred_at),
		}));
	}

	static async insertMany(items: Array<{
		store_id: string;
		base_currency: string;
		currency: string;
		rate_to_base: number;
		actor_user_id?: string | null;
		occurred_at?: string;
	}>, executor?: Pick<ReturnType<typeof DbConn.getClient>, "execute">): Promise<void> {
		await StoreCurrencyRateHistoryInterface.ensureTable();
		if (items.length === 0) return;
		const db = executor || DbConn.getClient();
		for (const item of items) {
			await db.execute({
				sql: `
					INSERT INTO store_currency_rate_history (
						id,
						store_id,
						base_currency,
						currency,
						rate_to_base,
						actor_user_id,
						occurred_at
					) VALUES (?, ?, ?, ?, ?, ?, ?)
				`,
				args: [
					randomUUID(),
					item.store_id,
					item.base_currency,
					item.currency,
					item.rate_to_base,
					item.actor_user_id ?? null,
					item.occurred_at ?? new Date().toISOString(),
				] as InValue[],
			});
		}
	}
}
