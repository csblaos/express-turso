import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { createClient } from "@libsql/client";
import bcrypt from "bcryptjs";
import { inspectLatestSchema, migrateDatabase } from "./migrations.mjs";

const directory = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(directory, "config.json");
const schemaPath = path.join(directory, "schema.sql");
const command = process.argv[2];
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._]{2,31}$/;

function fail(message) {
	throw new Error(message);
}

function normalizeUsername(value) {
	return String(value || "").trim().toLowerCase();
}

function usernameBaseFromEmail(email) {
	const base = (email.split("@")[0] || "user").toLowerCase()
		.replace(/[^a-z0-9._]/g, ".")
		.replace(/[._]+/g, ".")
		.replace(/^\.|\.$/g, "");
	return (base.length >= 3 ? base : "user").slice(0, 26);
}

export function normalizeConfig(input) {
	if (!input || typeof input !== "object") fail("config.json ไม่ใช่ JSON ที่ถูกต้อง");
	const source = input;
	const config = {
		url: String(source.database?.url || "").trim(),
		authToken: String(source.database?.authToken || "").trim(),
		accounts: normalizeAccounts(source),
	};
	if (!config.url) fail("database.url จำเป็นต้องระบุ");
	if (!config.url.startsWith("file:") && !config.authToken) fail("database.authToken จำเป็นสำหรับ Database แบบ remote");
	if (config.accounts.length === 0) fail("ต้องระบุอย่างน้อยหนึ่งบัญชีใน superadmin หรือ systemAdmin");
	return config;
}

async function loadConfig() {
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
	return normalizeConfig(input);
}

// `superadmin` is the customer-facing owner account that works inside a store.
// `system_admin` is the platform operator and is blocked from the store
// workspace entirely, so the two are seeded from separate config blocks.
function normalizeAccounts(input) {
	const accounts = [];
	for (const [ key, role ] of [ [ "systemAdmin", "system_admin" ], [ "superadmin", "superadmin" ] ]) {
		const raw = input[key];
		if (!raw) continue;

		const account = {
			key,
			role,
			name: String(raw.name || "").trim(),
			username: normalizeUsername(raw.username),
			email: String(raw.email || "").trim().toLowerCase(),
			password: String(raw.password || ""),
			locale: String(raw.locale || "lo").trim() || "lo",
		};
		if (!account.name) fail(`${key}.name จำเป็นต้องระบุ`);
		if (!USERNAME_PATTERN.test(account.username)) {
			fail(`${key}.username ต้องมี 3-32 ตัว ใช้ได้เฉพาะ a-z, 0-9, . และ _ และต้องขึ้นต้นด้วยตัวอักษรหรือตัวเลข`);
		}
		if (!account.email.includes("@")) fail(`${key}.email ไม่ถูกต้อง`);
		if (account.password.length < 6) fail(`${key}.password ต้องมีอย่างน้อย 6 ตัวอักษร`);
		accounts.push(account);
	}

	const duplicate = accounts.length === 2 && accounts[0].email === accounts[1].email;
	if (duplicate) fail("systemAdmin.email และ superadmin.email ต้องเป็นคนละอีเมล");
	const duplicateUsername = accounts.length === 2 && accounts[0].username === accounts[1].username;
	if (duplicateUsername) fail("systemAdmin.username และ superadmin.username ต้องไม่ซ้ำกัน");
	return accounts;
}

export function databaseLabel(url) {
	if (url.startsWith("file:")) return url;
	try {
		return new URL(url.replace(/^libsql:/, "https:")).hostname;
	} catch {
		return "remote-database";
	}
}

export async function checkDatabaseConnection(input) {
	const url = String(input?.url || "").trim();
	const authToken = String(input?.authToken || "").trim();
	if (!url) fail("database.url จำเป็นต้องระบุ");
	if (!url.startsWith("file:") && !authToken) {
		fail("database.authToken จำเป็นสำหรับ Database แบบ remote");
	}

	const client = createClient({
		url,
		...(url.startsWith("file:") ? {} : { authToken }),
	});
	try {
		await client.execute("SELECT 1 AS ok");
		return { database: databaseLabel(url), connected: true };
	} finally {
		client.close();
	}
}

function quoteIdentifier(value) {
	return `"${String(value).replaceAll("\"", "\"\"")}"`;
}

async function ensureUsernameCompatibility(client) {
	const usersTable = await client.execute(
		"SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'users' LIMIT 1",
	);
	if (usersTable.rows.length === 0) return;

	const columns = await client.execute("PRAGMA table_info(users)");
	const hasUsername = columns.rows.some((row) => String(row.name) === "username");
	if (!hasUsername) {
		await client.execute("ALTER TABLE users ADD COLUMN username TEXT");
	}

	const missingUsers = await client.execute(
		"SELECT id, email FROM users WHERE username IS NULL OR TRIM(username) = ''",
	);
	for (const user of missingUsers.rows) {
		const base = usernameBaseFromEmail(String(user.email || ""));
		let candidate = base;
		let sequence = 1;
		while (true) {
			const collision = await client.execute({
				sql: "SELECT 1 FROM users WHERE LOWER(username) = ? AND id <> ? LIMIT 1",
				args: [ candidate, String(user.id) ],
			});
			if (collision.rows.length === 0) break;
			candidate = `${base.slice(0, 26)}.${sequence++}`;
		}
		await client.execute({
			sql: "UPDATE users SET username = ? WHERE id = ?",
			args: [ candidate, String(user.id) ],
		});
	}
}

async function applySchema(client) {
	// Existing databases may predate username. Do this before schema.sql creates
	// the username index, so init remains safe to run on an older database.
	await ensureUsernameCompatibility(client);
	// Upgrade existing tables first so indexes in schema.sql can be created safely.
	await migrateDatabase(client);
	await client.executeMultiple(await fs.readFile(schemaPath, "utf8"));
	// A fresh database had no tables during the first pass.
	await migrateDatabase(client);
}

function accountLabel(role) {
	return role === "system_admin" ? "System Admin" : "Super Admin";
}

async function seedAccount(client, account, log) {
	const label = accountLabel(account.role);
	const existing = await client.execute({
		sql: "SELECT id, username FROM users WHERE LOWER(email) = ? LIMIT 1",
		args: [account.email],
	});
	if (existing.rows.length > 0) {
		log(`${label} ${account.email} มีอยู่แล้ว (username: ${String(existing.rows[0]?.username || "-")}, ไม่เปลี่ยนรหัสผ่าน)`);
		return;
	}

	// A system admin never reaches the store workspace, so store quotas stay off.
	const canCreateStores = account.role === "superadmin" ? 1 : 0;
	const timestamp = new Date().toISOString();
	await client.execute({
		sql: `INSERT INTO users (
			id, name, username, email, created_at, can_create_stores, max_stores,
			can_create_branches, max_branches_per_store, created_by,
			password_hash, session_limit, system_role, must_change_password,
			password_updated_at, ui_locale, client_suspended
		) VALUES (?, ?, ?, ?, ?, ?, NULL, 0, NULL, NULL, ?, NULL, ?, 1, ?, ?, 0)`,
		args: [
			randomUUID(),
			account.name,
			account.username,
			account.email,
			timestamp,
			canCreateStores,
			await bcrypt.hash(account.password, 10),
			account.role,
			timestamp,
			account.locale,
		],
	});
	log(`สร้าง ${label} สำเร็จ: ${account.username} (${account.email})`);
}

async function initialize(client, config, log) {
	log("กำลังสร้างโครงสร้าง Database...");
	await applySchema(client);
	for (const account of config.accounts) {
		await seedAccount(client, account, log);
	}
	log("Database พร้อมใช้งานแล้ว");
}

async function resetDatabase(client, config, log) {
	const result = await client.execute(`SELECT type, name FROM sqlite_master
		WHERE name NOT LIKE 'sqlite_%' AND type IN ('trigger', 'view', 'table', 'index')
		ORDER BY CASE type WHEN 'trigger' THEN 0 WHEN 'view' THEN 1
			WHEN 'index' THEN 2 WHEN 'table' THEN 3 ELSE 4 END`);
	await client.executeMultiple([
		"PRAGMA foreign_keys=OFF;",
		...result.rows.map((row) =>
			`DROP ${String(row.type).toUpperCase()} IF EXISTS ${quoteIdentifier(row.name)};`),
		"PRAGMA foreign_keys=ON;",
	].join("\n"));
	log(`ล้าง ${result.rows.length} Database objects สำเร็จ`);
	await initialize(client, config, log);
}

async function check(client, config, log) {
	const tables = await client.execute(
		"SELECT COUNT(*) AS total FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
	);
	let systemAdmins = 0;
	let superadmins = 0;
	try {
		const result = await client.execute(
			`SELECT LOWER(system_role) AS role, COUNT(*) AS total FROM users
			WHERE LOWER(system_role) IN ('system_admin', 'superadmin') GROUP BY LOWER(system_role)`,
		);
		for (const row of result.rows) {
			if (row.role === "system_admin") systemAdmins = Number(row.total || 0);
			if (row.role === "superadmin") superadmins = Number(row.total || 0);
		}
	} catch {
		// A completely empty database has no users table yet.
	}
	const summary = {
		database: databaseLabel(config.url),
		tables: Number(tables.rows[0]?.total || 0),
		systemAdmins,
		superadmins,
		schema: await inspectLatestSchema(client),
	};
	log(`Database: ${summary.database}`);
	log(summary.schema.ready ? `Schema ล่าสุด: ${summary.schema.version}` : `Schema ยังไม่ครบ: ${[...summary.schema.missingTables, ...summary.schema.missingColumns].join(", ")}`);
	log(`Tables: ${summary.tables}`);
	log(`System Admin accounts: ${summary.systemAdmins}`);
	log(`Super Admin accounts: ${summary.superadmins}`);
	if (systemAdmins === 0) {
		log("คำเตือน: ไม่มีบัญชี System Admin หน้า /system-admin จะเข้าไม่ได้");
	}
	return summary;
}

export async function runDatabaseSetup(input, action, onLog = () => {}) {
	if (!["init", "migrate", "reset", "check"].includes(action)) {
		fail("คำสั่งไม่ถูกต้อง");
	}

	const config = input?.url && Array.isArray(input.accounts)
		? input
		: normalizeConfig(input);
	const client = createClient({
		url: config.url,
		...(config.url.startsWith("file:") ? {} : { authToken: config.authToken }),
	});
	try {
		await client.execute("SELECT 1");
		if (action === "init") await initialize(client, config, onLog);
		if (action === "migrate") {
			onLog("กำลังอัปเดต Schema โดยไม่ลบข้อมูล...");
			await applySchema(client);
			onLog("อัปเดต Schema สำเร็จ");
		}
		if (action === "reset") await resetDatabase(client, config, onLog);
		if (action === "check") return await check(client, config, onLog);
		return null;
	} finally {
		client.close();
	}
}

async function main() {
	if (!["init", "migrate", "reset", "check"].includes(command)) {
		fail("ใช้คำสั่ง: node setup.mjs <init|migrate|reset|check>");
	}

	const config = await loadConfig();
	if (command === "reset") {
		const label = databaseLabel(config.url);
		process.stdout.write("\nคำเตือน: จะลบข้อมูลร้าน การขาย ออเดอร์ สต็อก และผู้ใช้ทั้งหมดอย่างถาวร\n");
		process.stdout.write(`Database เป้าหมาย: ${label}\n`);
		const terminal = (await import("node:readline/promises")).createInterface({
			input: process.stdin,
			output: process.stdout,
		});
		const answer = await terminal.question(`พิมพ์ RESET ${label} เพื่อยืนยัน: `);
		terminal.close();
		if (answer !== `RESET ${label}`) fail("ยกเลิก เพราะข้อความยืนยันไม่ตรง");
	}

	await runDatabaseSetup(config, command, (message) => process.stdout.write(`${message}\n`));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().catch((error) => {
		process.stderr.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
		process.exitCode = 1;
	});
}
