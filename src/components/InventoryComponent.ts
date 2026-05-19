import { ErrorConfig } from "@configs/ErrorConfig";
import {
	InventoryAdjustmentInput,
	InventoryAdjustmentResult,
	InventoryBalanceListItem,
	InventoryFilters,
	InventoryInterface,
	InventoryMovementListItem,
} from "@interfaces/InventoryInterface";
import { ProductInterface } from "@interfaces/ProductInterface";
import { ApiError } from "@middlewares/ApiError";
import { StoreInterface } from "@interfaces/StoreInterface";

type InventoryMovementFilters = {
	storeId?: string;
	productId?: string;
	limit?: number;
	query?: string;
	type?: string;
	from?: string;
	to?: string;
};

function normalizeAdjustmentInput(payload: InventoryAdjustmentInput): InventoryAdjustmentInput {
	return {
		...payload,
		note: payload.note?.trim() || null,
		created_by: payload.created_by?.trim() || null,
		qty_base: Number(payload.qty_base),
	};
}

export class InventoryComponent {
	static async getBalances(requestId: string, filters: InventoryFilters): Promise<InventoryBalanceListItem[]> {
		void requestId;
		return InventoryInterface.findBalances(filters);
	}

	static async getMovements(requestId: string, filters: InventoryMovementFilters): Promise<InventoryMovementListItem[]> {
		void requestId;
		return InventoryInterface.findMovements(filters);
	}

	static async adjust(
		requestId: string,
		payload: InventoryAdjustmentInput,
		options: { allowNegativeStock?: boolean; refType?: string; refId?: string | null } = {},
	): Promise<InventoryAdjustmentResult> {
		void requestId;
		const input = normalizeAdjustmentInput(payload);

		if (!input.store_id || !input.product_id) {
			throw ApiError.BadRequestError("store_id and product_id are required");
		}

		if (!Number.isFinite(input.qty_base)) {
			throw ApiError.BadRequestError("qty_base must be a finite number");
		}

		if (input.mode === "set") {
			if (input.qty_base < 0) {
				throw ApiError.BadRequestError("qty_base must be greater than or equal to 0 for set mode");
			}
		} else if (input.qty_base <= 0) {
			throw ApiError.BadRequestError("qty_base must be greater than 0");
		}

		const product = await ProductInterface.findById(input.product_id);
		if (!product || product.store_id !== input.store_id) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.PRODUCT_NOT_FOUND);
		}

		const store = await StoreInterface.findById(input.store_id);
		const allowNegative = store ? Boolean(Number(store.allow_negative_stock || 0)) : Boolean(options.allowNegativeStock);
		if (!allowNegative && (input.mode === "decrement" || input.mode === "set")) {
			const current = await InventoryInterface.getBalanceNumbers(input.store_id, input.product_id);
			const nextOnHand = input.mode === "set"
				? input.qty_base
				: current.on_hand_base - input.qty_base;
			const nextAvailable = nextOnHand - current.reserved_base;

			if (nextOnHand < 0 || nextAvailable < 0) {
				throw ApiError.BadRequestError(
					"สต็อกไม่เพียงพอ: การปรับครั้งนี้จะทำให้สต็อกติดลบ (ต้องใช้สิทธิ์อนุญาตสต็อกติดลบ)",
				);
			}
		}

		return InventoryInterface.adjustStock(input, {
			refType: options.refType,
			refId: options.refId,
		});
	}
}
