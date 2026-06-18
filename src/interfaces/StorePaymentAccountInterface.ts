import { randomUUID } from "crypto";

import { InValue } from "@libsql/client";

import { DbConn } from "@connections/DbConn";

export type StorePaymentAccountRow = {
	id: string;
	store_id: string;
	display_name: string;
	account_type: string | null;
	bank_name: string | null;
	account_name: string;
	account_number: string | null;
	qr_id: string | null;
	is_default: number;
	is_active: number;
	created_at: string;
	updated_at: string;
	qr_image_url: string | null;
	currency: string;
};

export type StorePaymentAccountCreateInput = {
	display_name: string;
	bank_name?: string | null;
	account_name: string;
	account_number?: string | null;
	qr_id?: string | null;
	is_default?: number;
	is_active?: number;
	qr_image_url?: string | null;
	currency?: string;
};

export type StorePaymentAccountUpdateInput = Partial<StorePaymentAccountCreateInput>;

function normalizeOptionalText(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const text = value.trim();
	return text ? text : null;
}

function getWritablePayload(input: Record<string, unknown>): Record<string, InValue> {
	const payload: Record<string, InValue> = {};

	for (const [ key, value ] of Object.entries(input)) {
		if (value === undefined) continue;
		if (key === "bank_name" || key === "account_number" || key === "qr_id" || key === "qr_image_url" || key === "currency" || key === "display_name" || key === "account_name") {
			payload[key] = value as InValue;
			continue;
		}
		if (key === "is_default" || key === "is_active") {
			payload[key] = Number(value) as InValue;
			continue;
		}
	}

	return payload;
}

export class StorePaymentAccountInterface {
	private static initialized = false;

	private static readonly createTableSql = `
		CREATE TABLE IF NOT EXISTS store_payment_accounts (
			id TEXT PRIMARY KEY,
			store_id TEXT NOT NULL,
			display_name TEXT NOT NULL,
			account_type TEXT,
			bank_name TEXT,
			account_name TEXT NOT NULL,
			account_number TEXT,
			promptpay_id TEXT,
			is_default INTEGER NOT NULL DEFAULT 0,
			is_active INTEGER NOT NULL DEFAULT 1,
			created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
			updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
			qr_image_url TEXT,
			currency TEXT NOT NULL DEFAULT 'LAK'
		)
	`;

	private static async migrateAccountTypeNullable(): Promise<void> {
		const db = DbConn.getClient();

		await db.execute("BEGIN IMMEDIATE TRANSACTION");
		try {
			await db.execute("DROP TABLE IF EXISTS store_payment_accounts__migrate");
			await db.execute(`
				CREATE TABLE store_payment_accounts__migrate (
					id TEXT PRIMARY KEY,
					store_id TEXT NOT NULL,
					display_name TEXT NOT NULL,
					account_type TEXT,
					bank_name TEXT,
					account_name TEXT NOT NULL,
					account_number TEXT,
					promptpay_id TEXT,
					is_default INTEGER NOT NULL DEFAULT 0,
					is_active INTEGER NOT NULL DEFAULT 1,
					created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
					updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
					qr_image_url TEXT,
					currency TEXT NOT NULL DEFAULT 'LAK'
				)
			`);

			await db.execute(`
				INSERT INTO store_payment_accounts__migrate (
					id,
					store_id,
					display_name,
					account_type,
					bank_name,
					account_name,
					account_number,
					promptpay_id,
					is_default,
					is_active,
					created_at,
					updated_at,
					qr_image_url,
					currency
				)
				SELECT
					id,
					store_id,
					display_name,
					account_type,
					bank_name,
					account_name,
					account_number,
					promptpay_id,
					is_default,
					is_active,
					created_at,
					updated_at,
					qr_image_url,
					currency
				FROM store_payment_accounts
			`);

			await db.execute("DROP TABLE store_payment_accounts");
			await db.execute("ALTER TABLE store_payment_accounts__migrate RENAME TO store_payment_accounts");
			await db.execute("COMMIT");
		} catch (error) {
			await db.execute("ROLLBACK").catch(() => undefined);
			throw error;
		}
	}

	private static async ensureTable(): Promise<void> {
		if (StorePaymentAccountInterface.initialized) return;
		const db = DbConn.getClient();

		await db.execute(StorePaymentAccountInterface.createTableSql);

		const tableInfoResult = await db.execute("PRAGMA table_info(store_payment_accounts)");
		const accountTypeColumn = tableInfoResult.rows.find((row) => String(row.name || "") === "account_type");
		if (accountTypeColumn && Number(accountTypeColumn.notnull || 0) === 1) {
			await StorePaymentAccountInterface.migrateAccountTypeNullable();
		}

		await db.execute("CREATE INDEX IF NOT EXISTS idx_store_payment_accounts_store ON store_payment_accounts (store_id, is_default DESC, is_active DESC, updated_at DESC)");
		StorePaymentAccountInterface.initialized = true;
	}

	static async findAllByStoreId(storeId: string): Promise<StorePaymentAccountRow[]> {
		await StorePaymentAccountInterface.ensureTable();
		const db = DbConn.getClient();
		const result = await db.execute({
			sql: `
				SELECT *
				FROM store_payment_accounts
				WHERE store_id = ?
				ORDER BY is_default DESC, is_active DESC, updated_at DESC, created_at DESC, display_name ASC
			`,
			args: [ storeId ],
		});
		return result.rows.map(StorePaymentAccountInterface.mapRow);
	}

	static async findById(storeId: string, id: string): Promise<StorePaymentAccountRow | null> {
		await StorePaymentAccountInterface.ensureTable();
		const db = DbConn.getClient();
		const result = await db.execute({
			sql: `
				SELECT *
				FROM store_payment_accounts
				WHERE store_id = ? AND id = ?
				LIMIT 1
			`,
			args: [ storeId, id ],
		});

		if (result.rows.length === 0) return null;
		return StorePaymentAccountInterface.mapRow(result.rows[0]);
	}

	static async findDefaultByStoreId(storeId: string): Promise<StorePaymentAccountRow | null> {
		await StorePaymentAccountInterface.ensureTable();
		const db = DbConn.getClient();
		const result = await db.execute({
			sql: `
				SELECT *
				FROM store_payment_accounts
				WHERE store_id = ?
				ORDER BY is_default DESC, is_active DESC, updated_at DESC, created_at DESC
				LIMIT 1
			`,
			args: [ storeId ],
		});

		if (result.rows.length === 0) return null;
		return StorePaymentAccountInterface.mapRow(result.rows[0]);
	}

	static async create(storeId: string, payload: StorePaymentAccountCreateInput): Promise<StorePaymentAccountRow> {
		await StorePaymentAccountInterface.ensureTable();
		const db = DbConn.getClient();
		const id = randomUUID();
		const nowIso = new Date().toISOString();
		const existingCountResult = await db.execute({
			sql: "SELECT COUNT(*) AS total FROM store_payment_accounts WHERE store_id = ?",
			args: [ storeId ],
		});
		const existingCount = Number(existingCountResult.rows[0]?.total || 0);
		const isDefault = Number(payload.is_default || 0) || existingCount === 0 ? 1 : 0;
			const insertPayload: Record<string, InValue> = {
				id,
				store_id: storeId,
				display_name: payload.display_name,
				bank_name: normalizeOptionalText(payload.bank_name),
				account_name: payload.account_name,
			account_number: normalizeOptionalText(payload.account_number),
			promptpay_id: normalizeOptionalText(payload.qr_id),
			is_default: isDefault,
			is_active: Number(payload.is_active ?? 1) ? 1 : 0,
			created_at: nowIso,
			updated_at: nowIso,
			qr_image_url: normalizeOptionalText(payload.qr_image_url),
			currency: String(payload.currency || "LAK").trim().toUpperCase() || "LAK",
		};

		const keys = Object.keys(insertPayload);
		const placeholders = keys.map(() => "?").join(", ");

		await db.execute({
			sql: `INSERT INTO store_payment_accounts (${keys.join(", ")}) VALUES (${placeholders})`,
			args: Object.values(insertPayload),
		});

		if (isDefault) {
			await StorePaymentAccountInterface.setDefault(storeId, id);
		}

		const created = await StorePaymentAccountInterface.findById(storeId, id);
		if (!created) throw new Error("Failed to create store payment account");
		return created;
	}

	static async update(storeId: string, id: string, data: StorePaymentAccountUpdateInput): Promise<StorePaymentAccountRow> {
		await StorePaymentAccountInterface.ensureTable();
		const db = DbConn.getClient();
		const existing = await StorePaymentAccountInterface.findById(storeId, id);
		if (!existing) throw new Error("Store payment account not found");

		const updatePayload = getWritablePayload({
			display_name: data.display_name,
			bank_name: data.bank_name === undefined ? undefined : normalizeOptionalText(data.bank_name),
			account_name: data.account_name,
			account_number: data.account_number === undefined ? undefined : normalizeOptionalText(data.account_number),
			qr_id: data.qr_id === undefined ? undefined : normalizeOptionalText(data.qr_id),
			is_default: data.is_default === undefined ? undefined : Number(data.is_default) ? 1 : 0,
			is_active: data.is_active === undefined ? undefined : Number(data.is_active) ? 1 : 0,
			qr_image_url: data.qr_image_url === undefined ? undefined : normalizeOptionalText(data.qr_image_url),
			currency: data.currency === undefined ? undefined : String(data.currency || "").trim().toUpperCase() || "LAK",
		});

		const keys = Object.keys(updatePayload);
		if (keys.length === 0) {
			return existing;
		}

		const nowIso = new Date().toISOString();
		updatePayload.updated_at = nowIso;

		const setClause = Object.keys(updatePayload).map((key) => `${key === "qr_id" ? "promptpay_id" : key} = ?`).join(", ");
		const values = Object.entries(updatePayload).map(([ key, value ]) => {
			if (key === "qr_id") return value as InValue;
			return value as InValue;
		});

		await db.execute({
			sql: `UPDATE store_payment_accounts SET ${setClause} WHERE store_id = ? AND id = ?`,
			args: [ ...values, storeId, id ],
		});

		if (Number(data.is_default || 0) === 1) {
			await StorePaymentAccountInterface.setDefault(storeId, id);
		}

		const updated = await StorePaymentAccountInterface.findById(storeId, id);
		if (!updated) throw new Error("Store payment account not found");
		return updated;
	}

	static async delete(storeId: string, id: string): Promise<boolean> {
		await StorePaymentAccountInterface.ensureTable();
		const existing = await StorePaymentAccountInterface.findById(storeId, id);
		if (!existing) return false;

		const db = DbConn.getClient();
		await db.execute({
			sql: "DELETE FROM store_payment_accounts WHERE store_id = ? AND id = ?",
			args: [ storeId, id ],
		});

		if (existing.is_default) {
			const fallback = await StorePaymentAccountInterface.findDefaultByStoreId(storeId);
			if (fallback) {
				await StorePaymentAccountInterface.setDefault(storeId, fallback.id);
			}
		}

		return true;
	}

	static async setDefault(storeId: string, id: string): Promise<StorePaymentAccountRow> {
		await StorePaymentAccountInterface.ensureTable();
		const existing = await StorePaymentAccountInterface.findById(storeId, id);
		if (!existing) throw new Error("Store payment account not found");

		const db = DbConn.getClient();
		await db.execute({
			sql: "UPDATE store_payment_accounts SET is_default = 0 WHERE store_id = ?",
			args: [ storeId ],
		});
		await db.execute({
			sql: "UPDATE store_payment_accounts SET is_default = 1, updated_at = ? WHERE store_id = ? AND id = ?",
			args: [ new Date().toISOString(), storeId, id ],
		});

		const updated = await StorePaymentAccountInterface.findById(storeId, id);
		if (!updated) throw new Error("Store payment account not found");
		return updated;
	}

	private static mapRow(row: Record<string, unknown>): StorePaymentAccountRow {
		return {
			id: String(row.id || ""),
			store_id: String(row.store_id || ""),
			display_name: String(row.display_name || ""),
			account_type: row.account_type === null || row.account_type === undefined ? null : String(row.account_type),
			bank_name: row.bank_name === null || row.bank_name === undefined ? null : String(row.bank_name),
			account_name: String(row.account_name || ""),
			account_number: row.account_number === null || row.account_number === undefined ? null : String(row.account_number),
			qr_id: row.promptpay_id === null || row.promptpay_id === undefined ? null : String(row.promptpay_id),
			is_default: Number(row.is_default || 0),
			is_active: Number(row.is_active || 0),
			created_at: String(row.created_at || ""),
			updated_at: String(row.updated_at || ""),
			qr_image_url: row.qr_image_url === null || row.qr_image_url === undefined ? null : String(row.qr_image_url),
			currency: String(row.currency || "LAK"),
		};
	}
}
