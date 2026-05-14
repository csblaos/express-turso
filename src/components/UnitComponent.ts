import { ErrorConfig } from "@configs/ErrorConfig";
import { UnitInterface } from "@interfaces/UnitInterface";
import { ApiError } from "@middlewares/ApiError";
import { CreateUnitInput, Unit, UpdateUnitInput } from "@models/Unit";

const UPDATABLE_FIELDS: Array<keyof UpdateUnitInput> = [
	"code",
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
	return !payload.code || !payload.name_th;
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

	static async create(requestId: string, payload: CreateUnitInput): Promise<Unit> {
		void requestId;
		if (!payload || isMissingCreateField(payload)) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.UNIT_REQUIRED_FIELDS);
		}

		return UnitInterface.create(payload);
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
