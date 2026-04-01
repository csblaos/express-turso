import { ErrorConfig } from "@configs/ErrorConfig";
import { ApiError } from "@middlewares/ApiError";
import { StoreInterface } from "@interfaces/StoreInterface";
import { CreateStoreInput, Store } from "@models/Store";

const UPDATABLE_FIELDS: Array<keyof Store> = [
	"name",
	"logo_name",
	"logo_url",
	"address",
	"phone_number",
	"store_type",
	"currency",
	"supported_currencies",
	"vat_enabled",
	"vat_rate",
	"vat_mode",
	"out_stock_threshold",
	"low_stock_threshold",
	"max_branches_override",
	"pdf_show_logo",
	"pdf_show_signature",
	"pdf_show_note",
	"pdf_header_color",
	"pdf_company_name",
	"pdf_company_address",
	"pdf_company_phone",
];

type UpdatableStoreKey = (typeof UPDATABLE_FIELDS)[number];

function pickUpdateFields(input: Record<string, unknown>): Partial<Store> {
	const result: Partial<Record<UpdatableStoreKey, Store[UpdatableStoreKey]>> = {};
	for (const key of UPDATABLE_FIELDS) {
		if (Object.prototype.hasOwnProperty.call(input, key)) {
			result[key] = input[key] as Store[UpdatableStoreKey];
		}
	}
	return result as Partial<Store>;
}

export class StoreComponent {
	static async getAll(requestId: string): Promise<Store[]> {
		void requestId;
		return StoreInterface.findAll();
	}

	static async getById(requestId: string, id: string): Promise<Store> {
		void requestId;
		const store = await StoreInterface.findById(id);
		if (!store) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.STORE_NOT_FOUND);
		}
		return store;
	}

	static async create(requestId: string, payload: CreateStoreInput): Promise<Store> {
		void requestId;
		if (!payload?.name) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.STORE_NAME_REQUIRED);
		}
		return StoreInterface.create(payload);
	}

	static async update(requestId: string, id: string, data: Record<string, unknown>): Promise<Store> {
		void requestId;
		const updateData = pickUpdateFields(data || {});
		return StoreInterface.update(id, updateData);
	}

	static async delete(requestId: string, id: string): Promise<void> {
		void requestId;
		const ok = await StoreInterface.delete(id);
		if (!ok) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.STORE_NOT_FOUND);
		}
	}
}
