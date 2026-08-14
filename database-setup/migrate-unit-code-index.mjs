import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { createClient } from "@libsql/client";

// The unit uniqueness indexes were written with WHERE scope='STORE' / 'SYSTEM'
// in upper case, but every row the application writes uses lower case. SQLite
// compares strings case-sensitively, so the partial indexes matched no rows and
// unit codes were never actually unique. These recreate them case-insensitively.
const INDEXES = [
	{
		name: "units_store_code_unique",
		sql: "CREATE UNIQUE INDEX units_store_code_unique ON units(store_id, code) WHERE LOWER(scope) = 'store'",
	},
	{
		name: "units_system_code_unique",
		sql: "CREATE UNIQUE INDEX units_system_code_unique ON units(code) WHERE LOWER(scope) = 'system'",
	},
];

const directory = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(directory, "config.json");
const apply = process.argv.includes("--apply");

function fail(message) {
	process.stderr.write(`Error: ${message}\n`);
	process.exit(1);
}

function write(line) {
	process.stdout.write(`${line}\n`);
}

async function loadDatabaseConfig() {
	let raw;
	try {
		raw = await fs.readFile(configPath, "utf8");
	} catch {
		fail("ไม่พบ config.json กรุณาคัดลอก config.example.json เป็น config.json แล้วกรอกข้อมูล");
	}

	let input;
	try {
		input = JSON.parse(raw);
	} catch {
		fail("config.json ไม่ใช่ JSON ที่ถูกต้อง");
	}

	const url = String(input.database?.url || "").trim();
	const authToken = String(input.database?.authToken || "").trim();
	if (!url) fail("database.url จำเป็นต้องระบุ");
	if (!url.startsWith("file:") && !authToken) fail("database.authToken จำเป็นสำหรับ Database แบบ remote");
	return { url, authToken };
}

function databaseLabel(url) {
	if (url.startsWith("file:")) return url;
	try {
		return new URL(url.replace(/^libsql:/, "https:")).hostname;
	} catch {
		return "remote-database";
	}
}

// Creating a unique index fails outright if the data already violates it, so
// the duplicates are reported first rather than surfacing as a raw SQL error.
async function findDuplicates(client) {
	const store = await client.execute(`
		SELECT store_id, LOWER(code) AS code, COUNT(*) AS total
		FROM units WHERE LOWER(scope) = 'store'
		GROUP BY store_id, LOWER(code) HAVING COUNT(*) > 1
	`);
	const system = await client.execute(`
		SELECT LOWER(code) AS code, COUNT(*) AS total
		FROM units WHERE LOWER(scope) = 'system'
		GROUP BY LOWER(code) HAVING COUNT(*) > 1
	`);
	return [
		...store.rows.map((row) => `store ${row.store_id} code "${row.code}" ซ้ำ ${row.total} แถว`),
		...system.rows.map((row) => `system code "${row.code}" ซ้ำ ${row.total} แถว`),
	];
}

const config = await loadDatabaseConfig();
const client = createClient({
	url: config.url,
	...(config.url.startsWith("file:") ? {} : { authToken: config.authToken }),
});

try {
	await client.execute("SELECT 1");
	write(`Database: ${databaseLabel(config.url)}`);
	write(apply ? "โหมด: apply (เขียนจริง)\n" : "โหมด: dry run (ยังไม่เขียน ใส่ --apply เพื่อรันจริง)\n");

	const existing = await client.execute(
		"SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'units'",
	);
	write("index ปัจจุบันบนตาราง units:");
	for (const row of existing.rows) {
		write(`  ${row.name}: ${row.sql || "(implicit)"}`);
	}

	const duplicates = await findDuplicates(client);
	write(`\nข้อมูลที่ขัดกับ unique index: ${duplicates.length} รายการ`);
	for (const line of duplicates) write(`  ${line}`);

	if (duplicates.length > 0) {
		fail("\nต้องแก้ code ที่ซ้ำให้เรียบร้อยก่อน จึงจะสร้าง unique index ได้");
	}

	write("\nจะสร้าง index ใหม่:");
	for (const index of INDEXES) write(`  ${index.sql}`);

	if (!apply) {
		write("\nนี่คือ dry run เท่านั้น รันซ้ำด้วย --apply เพื่อบันทึกการเปลี่ยนแปลง");
	} else {
		for (const index of INDEXES) {
			await client.execute(`DROP INDEX IF EXISTS ${index.name}`);
			await client.execute(index.sql);
		}
		write("\nสร้าง index ใหม่สำเร็จ");

		const after = await client.execute(
			"SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'units' AND sql IS NOT NULL",
		);
		for (const row of after.rows) write(`  ${row.name}: ${row.sql}`);
	}
} finally {
	client.close();
}
