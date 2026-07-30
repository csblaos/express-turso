import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { createClient } from "@libsql/client";
import bcrypt from "bcryptjs";

const directory = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(directory, "config.json");
const schemaPath = path.join(directory, "schema.sql");
const command = process.argv[2];

function fail(message) {
	process.stderr.write(`Error: ${message}\n`);
	process.exit(1);
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

	const config = {
		url: String(input.database?.url || "").trim(),
		authToken: String(input.database?.authToken || "").trim(),
		name: String(input.superadmin?.name || "").trim(),
		email: String(input.superadmin?.email || "").trim().toLowerCase(),
		password: String(input.superadmin?.password || ""),
		locale: String(input.superadmin?.locale || "lo").trim() || "lo",
	};
	if (!config.url) fail("database.url จำเป็นต้องระบุ");
	if (!config.url.startsWith("file:") && !config.authToken) fail("database.authToken จำเป็นสำหรับ Database แบบ remote");
	if (!config.name) fail("superadmin.name จำเป็นต้องระบุ");
	if (!config.email.includes("@")) fail("superadmin.email ไม่ถูกต้อง");
	if (config.password.length < 12) fail("superadmin.password ต้องมีอย่างน้อย 12 ตัวอักษร");
	return config;
}

function databaseLabel(url) {
	if (url.startsWith("file:")) return url;
	try {
		return new URL(url.replace(/^libsql:/, "https:")).hostname;
	} catch {
		return "remote-database";
	}
}

function quoteIdentifier(value) {
	return `"${String(value).replaceAll("\"", "\"\"")}"`;
}

async function applySchema(client) {
	await client.executeMultiple(await fs.readFile(schemaPath, "utf8"));
}

async function seedSuperadmin(client, config) {
	const existing = await client.execute({
		sql: "SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1",
		args: [config.email],
	});
	if (existing.rows.length > 0) {
		process.stdout.write(`Super Admin ${config.email} มีอยู่แล้ว (ไม่เปลี่ยนรหัสผ่าน)\n`);
		return;
	}

	const timestamp = new Date().toISOString();
	await client.execute({
		sql: `INSERT INTO users (
			id, name, email, created_at, can_create_stores, max_stores,
			can_create_branches, max_branches_per_store, created_by,
			password_hash, session_limit, system_role, must_change_password,
			password_updated_at, ui_locale, client_suspended
		) VALUES (?, ?, ?, ?, 1, NULL, 0, NULL, NULL, ?, NULL, 'superadmin', 1, ?, ?, 0)`,
		args: [
			randomUUID(),
			config.name,
			config.email,
			timestamp,
			await bcrypt.hash(config.password, 10),
			timestamp,
			config.locale,
		],
	});
	process.stdout.write(`สร้าง Super Admin สำเร็จ: ${config.email}\n`);
}

async function initialize(client, config) {
	process.stdout.write("กำลังสร้างโครงสร้าง Database...\n");
	await applySchema(client);
	await seedSuperadmin(client, config);
	process.stdout.write("Database พร้อมใช้งานแล้ว\n");
}

async function reset(client, config) {
	const label = databaseLabel(config.url);
	process.stdout.write("\nคำเตือน: จะลบข้อมูลร้าน การขาย ออเดอร์ สต็อก และผู้ใช้ทั้งหมดอย่างถาวร\n");
	process.stdout.write(`Database เป้าหมาย: ${label}\n`);
	const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
	const answer = await terminal.question(`พิมพ์ RESET ${label} เพื่อยืนยัน: `);
	terminal.close();
	if (answer !== `RESET ${label}`) fail("ยกเลิก เพราะข้อความยืนยันไม่ตรง");

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
	process.stdout.write(`ล้าง ${result.rows.length} Database objects สำเร็จ\n`);
	await initialize(client, config);
}

async function check(client, config) {
	const tables = await client.execute(
		"SELECT COUNT(*) AS total FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
	);
	let admins = 0;
	try {
		const result = await client.execute(
			"SELECT COUNT(*) AS total FROM users WHERE LOWER(system_role) = 'superadmin'",
		);
		admins = Number(result.rows[0]?.total || 0);
	} catch {
		// A completely empty database has no users table yet.
	}
	process.stdout.write(`Database: ${databaseLabel(config.url)}\n`);
	process.stdout.write(`Tables: ${Number(tables.rows[0]?.total || 0)}\n`);
	process.stdout.write(`Super Admin accounts: ${admins}\n`);
}

if (!["init", "reset", "check"].includes(command)) {
	fail("ใช้คำสั่ง: node setup.mjs <init|reset|check>");
}

const config = await loadConfig();
const client = createClient({
	url: config.url,
	...(config.url.startsWith("file:") ? {} : { authToken: config.authToken }),
});
try {
	await client.execute("SELECT 1");
	if (command === "init") await initialize(client, config);
	if (command === "reset") await reset(client, config);
	if (command === "check") await check(client, config);
} finally {
	client.close();
}
