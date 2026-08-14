import { ErrorConfig } from "@configs/ErrorConfig";
import { UnitInterface } from "@interfaces/UnitInterface";
import { ApiError } from "@middlewares/ApiError";
import { CreateUnitInput, Unit, UpdateUnitInput } from "@models/Unit";
import { generateUnitCode } from "@utils/UnitCodeGenerator";

// "code" is deliberately absent: it is the key the preset loader and CSV
// imports match on, so renaming it after the fact would orphan both.
const UPDATABLE_FIELDS: Array<keyof UpdateUnitInput> = [
	"name_th",
	"scope",
	"store_id",
];

function pickUpdateFields(input: Record<string, unknown>): UpdateUnitInput {
	const result: Partial<UpdateUnitInput> = {};

	for (const key of UPDATABLE_FIELDS) {
		if (Object.prototype.hasOwnProperty.call(input, key)) {
			result[key] = input[key] as never;
		}
	}

	return result as UpdateUnitInput;
}

function isMissingCreateField(payload: CreateUnitInput): boolean {
	return !payload.name_th;
}

export class UnitComponent {
	static async getAll(requestId: string, filters?: { storeId?: string; scope?: string }): Promise<Unit[]> {
		void requestId;
		return UnitInterface.findAll(filters);
	}

	static async getById(requestId: string, id: string): Promise<Unit> {
		void requestId;
		const unit = await UnitInterface.findById(id);
		if (!unit) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.UNIT_NOT_FOUND);
		}
		return unit;
	}

	// The code is derived from the name rather than typed: it exists so the
	// preset loader and CSV imports have a stable key, which is not something a
	// store should have to think about. Uniqueness is settled here because the
	// partial unique index only covers uppercase scopes.
	static async create(requestId: string, payload: CreateUnitInput): Promise<Unit> {
		void requestId;
		if (!payload || isMissingCreateField(payload)) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.UNIT_REQUIRED_FIELDS);
		}

		const storeId = payload.store_id ? String(payload.store_id).trim() : "";
		const siblings = storeId ? await UnitInterface.findAll({ storeId }) : [];
		const existingCodes = siblings.map((unit) => String(unit.code || ""));
		const requestedCode = String(payload.code || "").trim();
		const code = requestedCode && !existingCodes.some((existing) => existing.trim().toLowerCase() === requestedCode.toLowerCase())
			? requestedCode
			: generateUnitCode(String(payload.name_th), existingCodes);

		return UnitInterface.create({ ...payload, code });
	}

	static async importDefaults(requestId: string, storeId: string): Promise<Unit[]> {
		void requestId;
		if (!storeId.trim()) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.UNIT_REQUIRED_FIELDS);
		}

		return UnitInterface.ensureDefaultUnitsForStore(storeId.trim());
	}

	static async update(requestId: string, id: string, data: Record<string, unknown>): Promise<Unit> {
		void requestId;
		const updateData = pickUpdateFields(data || {});
		return UnitInterface.update(id, updateData);
	}

	static async delete(requestId: string, id: string): Promise<void> {
		void requestId;
		const ok = await UnitInterface.delete(id);
		if (!ok) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.UNIT_NOT_FOUND);
		}
	}
}
