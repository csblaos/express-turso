import { randomUUID } from "crypto";

import { InValue } from "@libsql/client";

import { DbConn } from "@connections/DbConn";
import { CreateUnitInput, Unit, UpdateUnitInput } from "@models/Unit";
import { DEFAULT_STORE_UNIT_PRESETS } from "@utils/DefaultStoreUnits";

type UnitWritableKey = Exclude<keyof Unit, "id">;

function getInsertPayload(payload: CreateUnitInput): Record<string, InValue> {
	const result: Record<string, InValue> = {
		id: payload.id || randomUUID(),
	};

	for (const [ key, value ] of Object.entries(payload)) {
		if (key === "id") continue;
		if (value === undefined) continue;
		result[key] = value;
	}

	return result;
}

function getUpdatePayload(data: UpdateUnitInput): Record<string, InValue> {
	const result: Record<string, InValue> = {};

	for (const [ key, value ] of Object.entries(data)) {
		if (key === "id") continue;
		if (value === undefined) continue;
		result[key] = value;
	}

	return result;
}

export class UnitInterface {
	static async findAll(filters?: { storeId?: string; scope?: string }): Promise<Unit[]> {
		const db = DbConn.getClient();

		if (filters?.storeId && filters?.scope) {
			const result = await db.execute({
				sql: "SELECT * FROM units WHERE store_id = ? AND scope = ? ORDER BY code ASC",
				args: [ filters.storeId, filters.scope ],
			});
			return result.rows.map(UnitInterface.mapRow);
		}

		if (filters?.storeId) {
			const result = await db.execute({
				sql: "SELECT * FROM units WHERE store_id = ? ORDER BY code ASC",
				args: [ filters.storeId ],
			});
			return result.rows.map(UnitInterface.mapRow);
		}

		if (filters?.scope) {
			const result = await db.execute({
				sql: "SELECT * FROM units WHERE scope = ? ORDER BY code ASC",
				args: [ filters.scope ],
			});
			return result.rows.map(UnitInterface.mapRow);
		}

		const result = await db.execute("SELECT * FROM units ORDER BY code ASC");
		return result.rows.map(UnitInterface.mapRow);
	}

	static async findById(id: string): Promise<Unit | null> {
		const db = DbConn.getClient();
		const result = await db.execute({
			sql: "SELECT * FROM units WHERE id = ? LIMIT 1",
			args: [ id ],
		});

		if (result.rows.length === 0) return null;
		return UnitInterface.mapRow(result.rows[0]);
	}

	static async create(payload: CreateUnitInput): Promise<Unit> {
		const db = DbConn.getClient();
		const insertPayload = getInsertPayload(payload);
		const id = String(insertPayload.id);
		const keys = Object.keys(insertPayload);
		const values = Object.values(insertPayload);
		const placeholders = keys.map(() => "?").join(", ");

		await db.execute({
			sql: `INSERT INTO units (${keys.join(", ")}) VALUES (${placeholders})`,
			args: values,
		});

		const created = await UnitInterface.findById(id);
		if (!created) throw new Error("Failed to create unit");

		return created;
	}

	static async ensureDefaultUnitsForStore(storeId: string): Promise<Unit[]> {
		const existingUnits = await UnitInterface.findAll({ storeId, scope: "store" });
		const existingCodes = new Set(existingUnits.map((unit) => String(unit.code || "").trim().toLowerCase()));
		const createdUnits: Unit[] = [];

		for (const preset of DEFAULT_STORE_UNIT_PRESETS) {
			const normalizedCode = preset.code.trim().toLowerCase();
			if (existingCodes.has(normalizedCode)) continue;
			const created = await UnitInterface.create({
				code: preset.code,
				name_th: preset.name_th,
				scope: "store",
				store_id: storeId,
			});
			createdUnits.push(created);
			existingCodes.add(normalizedCode);
		}

		return createdUnits;
	}

	static async update(id: string, data: UpdateUnitInput): Promise<Unit> {
		const updatePayload = getUpdatePayload(data);
		const keys = Object.keys(updatePayload) as UnitWritableKey[];
		const values = Object.values(updatePayload);

		if (keys.length === 0) {
			throw new Error("No data to update");
		}

		const setClause = keys.map((key) => `${key} = ?`).join(", ");
		const db = DbConn.getClient();

		await db.execute({
			sql: `UPDATE units SET ${setClause} WHERE id = ?`,
			args: [ ...values, id ],
		});

		const updated = await UnitInterface.findById(id);
		if (!updated) throw new Error("Unit not found");

		return updated;
	}

	static async delete(id: string): Promise<boolean> {
		const db = DbConn.getClient();
		const existing = await UnitInterface.findById(id);
		if (!existing) return false;

		await db.execute({
			sql: "DELETE FROM units WHERE id = ?",
			args: [ id ],
		});

		return true;
	}

	private static mapRow(row: Record<string, unknown>): Unit {
		return row as unknown as Unit;
	}
}
