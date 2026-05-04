import { ErrorConfig } from "@configs/ErrorConfig";
import { ProductUnitInterface } from "@interfaces/ProductUnitInterface";
import { ApiError } from "@middlewares/ApiError";
import {
	CreateProductUnitInput,
	ProductUnit,
	UpdateProductUnitInput,
} from "@models/ProductUnit";

const UPDATABLE_FIELDS: Array<keyof UpdateProductUnitInput> = [
	"product_id",
	"unit_id",
	"multiplier_to_base",
	"price_per_unit",
	"enabled_for_sale",
];

function pickUpdateFields(input: Record<string, unknown>): UpdateProductUnitInput {
	const result: Partial<UpdateProductUnitInput> = {};

	for (const key of UPDATABLE_FIELDS) {
		if (Object.prototype.hasOwnProperty.call(input, key)) {
			result[key] = input[key] as never;
		}
	}

	return result as UpdateProductUnitInput;
}

function isMissingCreateField(payload: CreateProductUnitInput): boolean {
	return !payload.product_id ||
		!payload.unit_id ||
		payload.multiplier_to_base === undefined;
}

function isInvalidMultiplier(value: unknown): boolean {
	return typeof value !== "number" || !Number.isFinite(value) || value <= 0;
}

export class ProductUnitComponent {
	static async getAll(
		requestId: string,
		filters?: { productId?: string; unitId?: string },
	): Promise<ProductUnit[]> {
		void requestId;
		return ProductUnitInterface.findAll(filters);
	}

	static async getById(requestId: string, id: string): Promise<ProductUnit> {
		void requestId;
		const productUnit = await ProductUnitInterface.findById(id);
		if (!productUnit) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.PRODUCT_UNIT_NOT_FOUND);
		}
		return productUnit;
	}

	static async create(requestId: string, payload: CreateProductUnitInput): Promise<ProductUnit> {
		void requestId;
		if (!payload || isMissingCreateField(payload)) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.PRODUCT_UNIT_REQUIRED_FIELDS);
		}

		if (isInvalidMultiplier(payload.multiplier_to_base)) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.PRODUCT_UNIT_INVALID_MULTIPLIER);
		}

		const existing = await ProductUnitInterface.findByProductAndUnit(payload.product_id, payload.unit_id);
		if (existing) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.PRODUCT_UNIT_DUPLICATE_PRODUCT_AND_UNIT);
		}

		return ProductUnitInterface.create(payload);
	}

	static async update(requestId: string, id: string, data: Record<string, unknown>): Promise<ProductUnit> {
		void requestId;
		const existing = await ProductUnitInterface.findById(id);
		if (!existing) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.PRODUCT_UNIT_NOT_FOUND);
		}

		const updateData = pickUpdateFields(data || {});
		const nextProductId = updateData.product_id ?? existing.product_id;
		const nextUnitId = updateData.unit_id ?? existing.unit_id;
		const nextMultiplier = updateData.multiplier_to_base ?? existing.multiplier_to_base;

		if (isInvalidMultiplier(nextMultiplier)) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.PRODUCT_UNIT_INVALID_MULTIPLIER);
		}

		const duplicate = await ProductUnitInterface.findByProductAndUnit(nextProductId, nextUnitId);
		if (duplicate && duplicate.id !== id) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.PRODUCT_UNIT_DUPLICATE_PRODUCT_AND_UNIT);
		}

		return ProductUnitInterface.update(id, updateData);
	}

	static async delete(requestId: string, id: string): Promise<void> {
		void requestId;
		const ok = await ProductUnitInterface.delete(id);
		if (!ok) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.PRODUCT_UNIT_NOT_FOUND);
		}
	}
}
