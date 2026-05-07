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

type InventoryMovementFilters = {
	storeId?: string;
	productId?: string;
	limit?: number;
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

	static async adjust(requestId: string, payload: InventoryAdjustmentInput): Promise<InventoryAdjustmentResult> {
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

		return InventoryInterface.adjustStock(input);
	}
}
