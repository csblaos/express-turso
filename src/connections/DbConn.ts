import { Client, createClient } from "@libsql/client";

import { ENV } from "@configs/ENV";

export class DbConn {
	private static client: Client | null = null;
	private static urlForLogging: string | null = null;
	private static connectPromise: Promise<void> | null = null;

	static getClient(): Client {
		if (!DbConn.client) {
			throw new Error("DbConn not connected. Call DbConn.connect() first.");
		}
		return DbConn.client;
	}

	static isConnected(): boolean {
		return Boolean(DbConn.client);
	}

	static getUrlForLogging(): string {
		return DbConn.urlForLogging || "unknown";
	}

	static async connect(): Promise<void> {
		if (DbConn.client) return;
		if (DbConn.connectPromise) return DbConn.connectPromise;

		const url = ENV.TURSO.DATABASE_URL || ENV.DB.URL || "file:./database.db";
		const authToken = url.startsWith("file:") ? undefined : ENV.TURSO.AUTH_TOKEN;

		DbConn.connectPromise = (async () => {
			try {
				DbConn.urlForLogging = url.startsWith("libsql://") ? "libsql://<redacted>" : "<redacted>";
				DbConn.client = createClient({
					url,
					...(authToken ? { authToken } : {}),
				});

				const label = url.startsWith("libsql://") ? "turso" : "sqlite";
				const startedAt = Date.now();

				if (label === "turso" && !authToken) {
					console.warn("[db] TURSO_AUTH_TOKEN is not set; connection may fail");
				}

				console.log(`[db] connecting (${label})`);
				await DbConn.client.execute("SELECT 1 as ok");
				console.log(`[db] connected (${label}) in ${Date.now() - startedAt}ms`);

				await DbConn.initSchema();
			} catch (error) {
				DbConn.client = null;
				DbConn.urlForLogging = null;
				throw error;
			}
		})().finally(() => {
			DbConn.connectPromise = null;
		});

		return DbConn.connectPromise;
	}

	private static async initSchema(): Promise<void> {
		const db = DbConn.getClient();

		await db.execute(`
			CREATE TABLE IF NOT EXISTS users (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				name TEXT NOT NULL,
				email TEXT NOT NULL UNIQUE,
				created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
			)
		`);

		await db.execute(`
			CREATE TABLE IF NOT EXISTS stores (
				id TEXT PRIMARY KEY,
				name TEXT NOT NULL,
				logo_name TEXT,
				logo_url TEXT,
				address TEXT,
				phone_number TEXT,

				store_type TEXT NOT NULL DEFAULT 'OTHER',
				currency TEXT NOT NULL DEFAULT 'LAK',
				supported_currencies TEXT NOT NULL DEFAULT 'LAK',

				vat_enabled INTEGER NOT NULL DEFAULT 0,
				vat_rate REAL NOT NULL DEFAULT 0,
				vat_mode TEXT NOT NULL DEFAULT 'EXCLUSIVE',

				out_stock_threshold INTEGER NOT NULL DEFAULT 0,
				low_stock_threshold INTEGER NOT NULL DEFAULT 0,
				allow_negative_stock INTEGER NOT NULL DEFAULT 0,
				max_branches_override INTEGER,

				pdf_show_logo INTEGER NOT NULL DEFAULT 1,
				pdf_show_signature INTEGER NOT NULL DEFAULT 0,
				pdf_show_note INTEGER NOT NULL DEFAULT 0,
				pdf_header_color TEXT NOT NULL DEFAULT '#000000',

				pdf_company_name TEXT,
				pdf_company_address TEXT,
				pdf_company_phone TEXT,

				created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
			)
		`);
	}
}
