import { ErrorConfig } from "@configs/ErrorConfig";
import { ProductCategoryInterface } from "@interfaces/ProductCategoryInterface";
import { ApiError } from "@middlewares/ApiError";
import {
	CreateProductCategoryInput,
	ProductCategory,
	UpdateProductCategoryInput,
} from "@models/ProductCategory";

const UPDATABLE_FIELDS: Array<keyof UpdateProductCategoryInput> = [
	"store_id",
	"name",
	"sort_order",
];

function pickUpdateFields(input: Record<string, unknown>): UpdateProductCategoryInput {
	const result: Partial<UpdateProductCategoryInput> = {};

	for (const key of UPDATABLE_FIELDS) {
		if (Object.prototype.hasOwnProperty.call(input, key)) {
			result[key] = input[key] as never;
		}
	}

	return result as UpdateProductCategoryInput;
}

function isMissingCreateField(payload: CreateProductCategoryInput): boolean {
	return !payload.store_id || !payload.name;
}

export class ProductCategoryComponent {
	static async getAll(requestId: string, storeId?: string): Promise<ProductCategory[]> {
		void requestId;
		return ProductCategoryInterface.findAll(storeId);
	}

	static async getById(requestId: string, id: string): Promise<ProductCategory> {
		void requestId;
		const category = await ProductCategoryInterface.findById(id);
		if (!category) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.PRODUCT_CATEGORY_NOT_FOUND);
		}
		return category;
	}

	static async create(requestId: string, payload: CreateProductCategoryInput): Promise<ProductCategory> {
		void requestId;
		if (!payload || isMissingCreateField(payload)) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.PRODUCT_CATEGORY_REQUIRED_FIELDS);
		}

		return ProductCategoryInterface.create(payload);
	}

	static async update(requestId: string, id: string, data: Record<string, unknown>): Promise<ProductCategory> {
		void requestId;
		const updateData = pickUpdateFields(data || {});
		return ProductCategoryInterface.update(id, updateData);
	}

	static async delete(requestId: string, id: string): Promise<void> {
		void requestId;
		const ok = await ProductCategoryInterface.delete(id);
		if (!ok) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.PRODUCT_CATEGORY_NOT_FOUND);
		}
	}
}
