import { ErrorConfig } from "@configs/ErrorConfig";
import { AuditEventInterface } from "@interfaces/AuditEventInterface";
import {
	InventoryAdjustmentInput,
	InventoryAdjustmentResult,
	InventoryBalanceListItem,
	InventoryFilters,
	InventoryInterface,
	InventoryListResult,
	InventoryMovementListItem,
	InventoryPageFilters,
} from "@interfaces/InventoryInterface";
import { NotificationInterface } from "@interfaces/NotificationInterface";
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
		adjustment_reason: payload.adjustment_reason?.trim() || null,
		created_by: payload.created_by?.trim() || null,
		qty_base: Number(payload.qty_base),
	};
}

export class InventoryComponent {
	static async getBalances(requestId: string, filters: InventoryFilters): Promise<InventoryBalanceListItem[]> {
		void requestId;
		return InventoryInterface.findBalances(filters);
	}

	static async getBalancePage(requestId: string, filters: InventoryPageFilters): Promise<InventoryListResult> {
		void requestId;
		return InventoryInterface.findBalancePage(filters);
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

		const result = await InventoryInterface.adjustStock(input, {
			refType: options.refType,
			refId: options.refId,
		});
		// Inventory history is the detailed ledger. Activity keeps a safe summary
		// for staff and never exposes the cost written off.
		await AuditEventInterface.create({
			scope: "store",
			store_id: input.store_id,
			actor_user_id: input.created_by || null,
			action: "inventory.adjust",
			entity_type: "inventory",
			entity_id: result.movement.id,
			result: "success",
			metadata: {
				product_name: result.movement.product_name,
				product_sku: result.movement.product_sku,
				movement_type: result.movement.type,
				quantity_change: result.movement.qty_base,
				unit_name: result.movement.unit_name,
				reason: result.movement.adjustment_reason,
				note: result.movement.note,
			},
			before: { on_hand_base: result.balance.on_hand_base - result.movement.qty_base },
			after: { on_hand_base: result.balance.on_hand_base },
		});
		NotificationInterface.queueStockRefresh(input.store_id);
		return result;
	}
}
