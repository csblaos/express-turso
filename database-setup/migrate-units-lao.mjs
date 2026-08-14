import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { createClient } from "@libsql/client";

// One-off migration that brings store units already in the database in line
// with DEFAULT_STORE_UNIT_PRESETS after the presets moved from Thai to Lao.
// Renames are safe (ids stay put, so products keep their unit), deletions are
// skipped whenever anything still points at the unit.
const RENAMES = new Map([
	[ "pcs", "ອັນ" ],
	[ "box", "ກ່ອງ" ],
	[ "pack", "ແພັກ" ],
	[ "set", "ຊຸດ" ],
	[ "btl", "ແກ້ວ" ],
	[ "plate", "ຈານ" ],
]);
const REMOVALS = new Set([ "kg", "g", "ltr", "ml" ]);
const ADDITIONS = [ { code: "plate", name: "ຈານ" } ];

// Every column that points at units.id; a unit referenced by any of them must
// stay, because the foreign keys are ON DELETE restrict.
const REFERENCES = [
	{ table: "products", column: "base_unit_id" },
	{ table: "product_units", column: "unit_id" },
	{ table: "order_items", column: "unit_id" },
	{ table: "purchase_order_items", column: "unit_id" },
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

async function countReferences(client, unitId) {
	let total = 0;
	for (const reference of REFERENCES) {
		const result = await client.execute({
			sql: `SELECT COUNT(*) AS total FROM ${reference.table} WHERE ${reference.column} = ?`,
			args: [ unitId ],
		});
		total += Number(result.rows[0]?.total || 0);
	}
	return total;
}

async function buildPlan(client) {
	const result = await client.execute(
		"SELECT id, code, name_th, scope, store_id FROM units WHERE LOWER(scope) = 'store' ORDER BY store_id, code",
	);
	const units = result.rows.map((row) => ({
		id: String(row.id),
		code: String(row.code || "").trim().toLowerCase(),
		name: String(row.name_th || ""),
		scope: String(row.scope || ""),
		storeId: String(row.store_id || ""),
	}));

	const renames = [];
	const deletions = [];
	const blocked = [];
	const additions = [];

	for (const unit of units) {
		const target = RENAMES.get(unit.code);
		if (target && unit.name !== target) {
			renames.push({ ...unit, target });
			continue;
		}

		if (!REMOVALS.has(unit.code)) continue;

		const references = await countReferences(client, unit.id);
		if (references > 0) blocked.push({ ...unit, references });
		else deletions.push(unit);
	}

	const storeIds = [ ...new Set(units.map((unit) => unit.storeId)) ];
	for (const storeId of storeIds) {
		for (const addition of ADDITIONS) {
			const exists = units.some((unit) => unit.storeId === storeId && unit.code === addition.code);
			if (exists) continue;
			additions.push({ id: randomUUID(), storeId, scope: "store", ...addition });
		}
	}

	return { units, renames, deletions, blocked, additions };
}

function report(plan) {
	write(`หน่วยแบบ store ทั้งหมด: ${plan.units.length} รายการ`);

	write(`\nเปลี่ยนชื่อเป็นภาษาลาว: ${plan.renames.length} รายการ`);
	for (const unit of plan.renames) {
		write(`  ${unit.code}: "${unit.name}" -> "${unit.target}" (store ${unit.storeId})`);
	}

	write(`\nเพิ่มหน่วยใหม่: ${plan.additions.length} รายการ`);
	for (const unit of plan.additions) {
		write(`  ${unit.code}: "${unit.name}" (store ${unit.storeId})`);
	}

	write(`\nลบหน่วยที่ไม่ใช้แล้ว: ${plan.deletions.length} รายการ`);
	for (const unit of plan.deletions) {
		write(`  ${unit.code}: "${unit.name}" (store ${unit.storeId})`);
	}

	write(`\nข้ามการลบเพราะยังมีข้อมูลอ้างอิงอยู่: ${plan.blocked.length} รายการ`);
	for (const unit of plan.blocked) {
		write(`  ${unit.code}: "${unit.name}" ถูกอ้างอิง ${unit.references} จุด (store ${unit.storeId})`);
	}
}

async function execute(client, plan) {
	const statements = [
		...plan.renames.map((unit) => ({
			sql: "UPDATE units SET name_th = ? WHERE id = ?",
			args: [ unit.target, unit.id ],
		})),
		...plan.additions.map((unit) => ({
			sql: "INSERT INTO units (id, code, name_th, scope, store_id) VALUES (?, ?, ?, 'store', ?)",
			args: [ unit.id, unit.code, unit.name, unit.storeId ],
		})),
		...plan.deletions.map((unit) => ({
			sql: "DELETE FROM units WHERE id = ?",
			args: [ unit.id ],
		})),
	];

	if (statements.length === 0) {
		write("\nไม่มีอะไรต้องแก้ ข้อมูลตรงกับ preset อยู่แล้ว");
		return;
	}

	await client.batch(statements, "write");
	write(`\nอัปเดต Database สำเร็จ (${statements.length} คำสั่ง)`);
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

	const plan = await buildPlan(client);
	report(plan);

	if (apply) await execute(client, plan);
	else write("\nนี่คือ dry run เท่านั้น รันซ้ำด้วย --apply เพื่อบันทึกการเปลี่ยนแปลง");
} finally {
	client.close();
}
