import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const scriptDir = __dirname;

export function loadConfigFile() {
	const configPath = path.join(scriptDir, "config.json");
	if (!fs.existsSync(configPath)) {
		return {};
	}

	try {
		const content = fs.readFileSync(configPath, "utf8");
		const parsed = JSON.parse(content);
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			exitWithError("config.json must contain a JSON object.");
		}
		return parsed;
	} catch (error) {
		exitWithError(`failed to read config.json: ${error.message}`);
	}
}

export function getDatabaseConfig(configSection, label) {
	if (!configSection || typeof configSection !== "object" || Array.isArray(configSection)) {
		exitWithError(`${label} config is required in config.json.`);
	}

	const { url, authToken } = configSection;

	if (!url || typeof url !== "string") {
		exitWithError(`${label}.url is required in config.json.`);
	}

	if (!authToken || typeof authToken !== "string") {
		exitWithError(`${label}.authToken is required in config.json.`);
	}

	return { url, authToken };
}

export function printUsage(message) {
	process.stdout.write(`${message}\n`);
}

export function exitWithError(message) {
	process.stderr.write(`Error: ${message}\n`);
	process.exit(1);
}

export function ensureCommand(command) {
	const result = spawnSync(command, ["--version"], {
		stdio: "ignore",
		shell: false,
	});

	if (result.error) {
		exitWithError(`command '${command}' is required.`);
	}
}

export function resolvePath(inputPath, baseDir = scriptDir) {
	return path.isAbsolute(inputPath) ? inputPath : path.resolve(baseDir, inputPath);
}

export function getDatabaseNameFromUrl(url) {
	try {
		const normalizedUrl = url.startsWith("libsql://") ? url.replace("libsql://", "https://") : url;
		const hostname = new URL(normalizedUrl).hostname;
		return hostname.split(".")[0] || "database";
	} catch {
		return "database";
	}
}

export function createRemoteClient(databaseConfig) {
	return createClient({
		url: databaseConfig.url,
		authToken: databaseConfig.authToken,
	});
}

export function quoteIdentifier(value) {
	return `"${String(value).replace(/"/g, "\"\"")}"`;
}

export function quoteSqlString(value) {
	return `'${String(value).replace(/'/g, "''")}'`;
}

export function sqlLiteral(value) {
	if (value === null) return "NULL";
	if (typeof value === "string") return quoteSqlString(value);
	if (typeof value === "number") {
		if (!Number.isFinite(value)) {
			exitWithError(`cannot serialize non-finite number value: ${value}`);
		}
		return String(value);
	}
	if (typeof value === "bigint") return value.toString();
	if (value instanceof ArrayBuffer) {
		return `X'${Buffer.from(value).toString("hex")}'`;
	}
	if (ArrayBuffer.isView(value)) {
		return `X'${Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString("hex")}'`;
	}

	exitWithError(`unsupported SQL value type: ${typeof value}`);
}

export async function exportDatabaseToSql(client) {
	const statements = [
		"PRAGMA foreign_keys=OFF;",
		"BEGIN TRANSACTION;",
	];

	const masterResult = await client.execute(`
		SELECT type, name, tbl_name, sql
		FROM sqlite_master
		WHERE sql IS NOT NULL
			AND name NOT LIKE 'sqlite_%'
		ORDER BY
			CASE type
				WHEN 'table' THEN 0
				WHEN 'index' THEN 1
				WHEN 'trigger' THEN 2
				WHEN 'view' THEN 3
				ELSE 4
			END,
			name
	`);

	const objects = masterResult.rows.map((row) => ({
		type: String(row.type),
		name: String(row.name),
		tableName: String(row.tbl_name),
		sql: String(row.sql),
	}));

	const tables = objects.filter((entry) => entry.type === "table");
	const indexes = objects.filter((entry) => entry.type === "index");
	const triggers = objects.filter((entry) => entry.type === "trigger");
	const views = objects.filter((entry) => entry.type === "view");

	for (const table of tables) {
		statements.push(`${table.sql};`);
	}

	for (const table of tables) {
		const tableName = quoteIdentifier(table.name);
		const rowsResult = await client.execute(`SELECT * FROM ${tableName}`);
		const columns = rowsResult.columns;
		if (columns.length === 0) continue;

		const columnList = columns.map((column) => quoteIdentifier(column)).join(", ");

		for (const row of rowsResult.rows) {
			const values = columns.map((column) => sqlLiteral(row[column])).join(", ");
			statements.push(`INSERT INTO ${tableName} (${columnList}) VALUES (${values});`);
		}
	}

	for (const index of indexes) {
		statements.push(`${index.sql};`);
	}

	for (const trigger of triggers) {
		statements.push(`${trigger.sql};`);
	}

	for (const view of views) {
		statements.push(`${view.sql};`);
	}

	statements.push("COMMIT;");
	statements.push("PRAGMA foreign_keys=ON;");

	return `${statements.join("\n")}\n`;
}

export function timestamp() {
	const now = new Date();
	const pad = (value) => String(value).padStart(2, "0");
	return [
		now.getFullYear(),
		pad(now.getMonth() + 1),
		pad(now.getDate()),
	].join("") + "-" + [
		pad(now.getHours()),
		pad(now.getMinutes()),
		pad(now.getSeconds()),
	].join("");
}

export function runTurso(args, options = {}) {
	const result = spawnSync("turso", args, {
		stdio: options.stdio ?? "inherit",
		input: options.input,
		encoding: options.encoding ?? "utf8",
		shell: false,
	});

	if (result.error) {
		exitWithError(result.error.message);
	}

	if (result.status !== 0) {
		process.exit(result.status ?? 1);
	}

	return result;
}
