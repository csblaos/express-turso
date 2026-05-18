import { InValue } from "@libsql/client";

import { DbConn } from "@connections/DbConn";

export type StoreCurrencyRateRow = {
	store_id: string;
	currency: string;
	rate_to_base: number;
	updated_at: string;
};

export class StoreCurrencyRateInterface {
	private static initialized = false;

	private static async ensureTable(): Promise<void> {
		if (StoreCurrencyRateInterface.initialized) return;
		const db = DbConn.getClient();

		await db.execute(`
			CREATE TABLE IF NOT EXISTS store_currency_rates (
				store_id TEXT NOT NULL,
				currency TEXT NOT NULL,
				rate_to_base REAL NOT NULL DEFAULT 1,
				updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
				PRIMARY KEY (store_id, currency)
			)
		`);

		await db.execute("CREATE INDEX IF NOT EXISTS idx_store_currency_rates_store ON store_currency_rates (store_id, currency)");
		StoreCurrencyRateInterface.initialized = true;
	}

	static async warmup(): Promise<void> {
		await StoreCurrencyRateInterface.ensureTable();
	}

	static async findByStoreId(storeId: string): Promise<StoreCurrencyRateRow[]> {
		await StoreCurrencyRateInterface.ensureTable();
		const db = DbConn.getClient();
		const result = await db.execute({
			sql: "SELECT * FROM store_currency_rates WHERE store_id = ? ORDER BY currency ASC",
			args: [ storeId ],
		});
		return result.rows.map((row) => ({
			store_id: String(row.store_id),
			currency: String(row.currency),
			rate_to_base: Number(row.rate_to_base ?? 1),
			updated_at: String(row.updated_at),
		}));
	}

	static async replaceRates(storeId: string, rates: Array<{ currency: string; rate_to_base: number }>): Promise<void> {
		await StoreCurrencyRateInterface.ensureTable();
		const db = DbConn.getClient();

		await db.execute({
			sql: "DELETE FROM store_currency_rates WHERE store_id = ?",
			args: [ storeId ],
		});

		if (rates.length === 0) return;

		const now = new Date().toISOString();
		for (const item of rates) {
			await db.execute({
				sql: `
					INSERT INTO store_currency_rates (store_id, currency, rate_to_base, updated_at)
					VALUES (?, ?, ?, ?)
				`,
				args: [ storeId, item.currency, item.rate_to_base, now ] as InValue[],
			});
		}
	}
}
