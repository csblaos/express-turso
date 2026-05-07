import "dotenv/config";

import { createClient } from "@libsql/client";

function getDbConfig() {
	const url = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL || "file:./database.db";
	const authToken = url.startsWith("file:") ? undefined : process.env.TURSO_AUTH_TOKEN;

	return { url, authToken };
}

function quoteIdentifier(value) {
	return `"${String(value).replace(/"/g, "\"\"")}"`;
}

async function main() {
	const { url, authToken } = getDbConfig();
	const client = createClient({
		url,
		...(authToken ? { authToken } : {}),
	});

	const tableArg = process.argv[2]?.trim();
	const whereTable = tableArg ? `AND name = '${tableArg.replace(/'/g, "''")}'` : "";

	const result = await client.execute(`
		SELECT name, type, sql
		FROM sqlite_master
		WHERE type IN ('table', 'view')
			AND name NOT LIKE 'sqlite_%'
			${whereTable}
		ORDER BY type, name
	`);

	const tables = [];

	for (const row of result.rows) {
		const tableName = String(row.name);
		const columnsResult = await client.execute(`PRAGMA table_info(${quoteIdentifier(tableName)})`);

		tables.push({
			name: tableName,
			type: String(row.type),
			columnCount: columnsResult.rows.length,
			columns: columnsResult.rows.map((column) => ({
				name: String(column.name),
				type: String(column.type || ""),
				notNull: Number(column.notnull) === 1,
				defaultValue: column.dflt_value ?? null,
				primaryKeyOrder: Number(column.pk || 0),
			})),
		});
	}

	process.stdout.write(JSON.stringify({
		driver: url.startsWith("libsql://") ? "turso" : url.startsWith("file:") ? "sqlite" : "unknown",
		tableCount: tables.length,
		tables,
	}, null, 2) + "\n");
}

main().catch((error) => {
	process.stderr.write(`${error.stack || error.message || String(error)}\n`);
	process.exit(1);
});
