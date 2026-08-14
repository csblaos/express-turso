export const LATEST_SCHEMA_VERSION = "2026-08-12-restaurant-kitchen-v1";

const requiredColumns = {
	stores: {
		kitchen_delivery_mode: "TEXT NOT NULL DEFAULT 'paper'",
		customer_display_enabled: "INTEGER NOT NULL DEFAULT 0",
		customer_display_ads: "TEXT",
		customer_display_ad_url: "TEXT",
		customer_display_ad_interval: "INTEGER NOT NULL DEFAULT 5",
		receipt_show_powered_by: "INTEGER NOT NULL DEFAULT 1",
		receipt_language: "TEXT NOT NULL DEFAULT ''",
		customer_display_banner_enabled: "INTEGER NOT NULL DEFAULT 1",
		business_day_start_confirmed_at: "TEXT",
	},
	products: { send_to_kitchen: "INTEGER" },
	product_categories: {
		station_id: "TEXT",
		send_to_kitchen: "INTEGER NOT NULL DEFAULT 1",
	},
	restaurant_order_rounds: {
		dispatch_mode: "TEXT NOT NULL DEFAULT 'kitchen'",
		kitchen_status: "TEXT NOT NULL DEFAULT 'pending'",
		kitchen_done_at: "TEXT",
		kitchen_done_by: "TEXT",
	},
	kitchen_round_station_status: {
		served_at: "TEXT",
		served_by: "TEXT",
	},
	orders: {
		payment_exchange_rate: "REAL NOT NULL DEFAULT 1",
		amount_tendered_foreign: "REAL",
	},
};

const requiredTables = {
	kitchen_stations: `CREATE TABLE IF NOT EXISTS kitchen_stations (
		id TEXT PRIMARY KEY, store_id TEXT NOT NULL, name TEXT NOT NULL,
		sort_order INTEGER NOT NULL DEFAULT 0, is_active INTEGER NOT NULL DEFAULT 1,
		created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(store_id, name)
	)`,
	kitchen_round_station_status: `CREATE TABLE IF NOT EXISTS kitchen_round_station_status (
		round_id TEXT NOT NULL, station_key TEXT NOT NULL, station_id TEXT,
		kitchen_status TEXT NOT NULL DEFAULT 'pending', kitchen_done_at TEXT, kitchen_done_by TEXT,
		served_at TEXT, served_by TEXT, PRIMARY KEY(round_id, station_key)
	)`,
	restaurant_printers: `CREATE TABLE IF NOT EXISTS restaurant_printers (
		id TEXT PRIMARY KEY, store_id TEXT NOT NULL, name TEXT NOT NULL, station_id TEXT,
		address TEXT NOT NULL, paper_width INTEGER NOT NULL DEFAULT 80,
		sort_order INTEGER NOT NULL DEFAULT 0, is_active INTEGER NOT NULL DEFAULT 1,
		created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(store_id, name)
	)`,
	print_agents: `CREATE TABLE IF NOT EXISTS print_agents (
		id TEXT PRIMARY KEY, store_id TEXT NOT NULL, name TEXT NOT NULL, token_hash TEXT NOT NULL,
		last_seen_at TEXT, is_active INTEGER NOT NULL DEFAULT 1,
		created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(store_id, name)
	)`,
	print_jobs: `CREATE TABLE IF NOT EXISTS print_jobs (
		id TEXT PRIMARY KEY, store_id TEXT NOT NULL, printer_id TEXT NOT NULL, kind TEXT NOT NULL,
		order_id TEXT, round_id TEXT, station_id TEXT, dedupe_key TEXT NOT NULL, payload TEXT NOT NULL,
		status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0, error TEXT,
		created_at TEXT NOT NULL, claimed_at TEXT, completed_at TEXT, UNIQUE(store_id, dedupe_key)
	)`,
};

const indexes = [
	"CREATE INDEX IF NOT EXISTS idx_kitchen_stations_store ON kitchen_stations(store_id, is_active, sort_order)",
	"CREATE INDEX IF NOT EXISTS idx_kitchen_round_station_status_round ON kitchen_round_station_status(round_id, kitchen_status)",
	"CREATE UNIQUE INDEX IF NOT EXISTS uq_print_agents_token ON print_agents(token_hash)",
	"CREATE INDEX IF NOT EXISTS idx_print_jobs_queue ON print_jobs(store_id, status, created_at)",
	"CREATE INDEX IF NOT EXISTS idx_restaurant_printers_store ON restaurant_printers(store_id, is_active, sort_order)",
];

async function tableNames(client) {
	const result = await client.execute("SELECT name FROM sqlite_master WHERE type='table'");
	return new Set(result.rows.map((row) => String(row.name)));
}

async function columnNames(client, table) {
	const result = await client.execute(`PRAGMA table_info(\"${table}\")`);
	return new Set(result.rows.map((row) => String(row.name)));
}

export async function inspectLatestSchema(client) {
	const tables = await tableNames(client);
	const missingTables = Object.keys(requiredTables).filter((name) => !tables.has(name));
	const missingColumns = [];
	for (const [table, columns] of Object.entries(requiredColumns)) {
		if (!tables.has(table)) {
			missingColumns.push(`${table}.*`);
			continue;
		}
		const existing = await columnNames(client, table);
		for (const name of Object.keys(columns)) if (!existing.has(name)) missingColumns.push(`${table}.${name}`);
	}
	return { version: LATEST_SCHEMA_VERSION, ready: missingTables.length === 0 && missingColumns.length === 0, missingTables, missingColumns };
}

export async function migrateDatabase(client, log = () => {}) {
	let tables = await tableNames(client);
	for (const [table, columns] of Object.entries(requiredColumns)) {
		if (!tables.has(table)) continue;
		const existing = await columnNames(client, table);
		for (const [name, definition] of Object.entries(columns)) {
			if (existing.has(name)) continue;
			await client.execute(`ALTER TABLE \"${table}\" ADD COLUMN \"${name}\" ${definition}`);
			log(`เพิ่ม column ${table}.${name}`);
		}
	}
	for (const [name, sql] of Object.entries(requiredTables)) {
		if (!tables.has(name)) log(`สร้าง table ${name}`);
		await client.execute(sql);
	}
	for (const sql of indexes) await client.execute(sql);
	await client.execute(`CREATE TABLE IF NOT EXISTS schema_migrations (
		id TEXT PRIMARY KEY, description TEXT NOT NULL,
		applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
	)`);
	await client.execute({
		sql: "INSERT OR IGNORE INTO schema_migrations (id, description) VALUES (?, ?)",
		args: [LATEST_SCHEMA_VERSION, "Kitchen stations, realtime queue, printing and payment fields"],
	});
	return inspectLatestSchema(client);
}
