import { ErrorConfig } from "@configs/ErrorConfig";
import { ProductInterface } from "@interfaces/ProductInterface";
import { ApiError } from "@middlewares/ApiError";
import { CreateProductInput, Product, UpdateProductInput } from "@models/Product";

const UPDATABLE_FIELDS: Array<keyof UpdateProductInput> = [
	"store_id",
	"sku",
	"name",
	"barcode",
	"base_unit_id",
	"price_base",
	"cost_base",
	"active",
	"image_url",
	"category_id",
	"out_stock_threshold",
	"low_stock_threshold",
	"model_id",
	"variant_label",
	"variant_options_json",
	"variant_sort_order",
	"allow_base_unit_sale",
];

function pickUpdateFields(input: Record<string, unknown>): UpdateProductInput {
	const result: Partial<UpdateProductInput> = {};

	for (const key of UPDATABLE_FIELDS) {
		if (Object.prototype.hasOwnProperty.call(input, key)) {
			result[key] = input[key] as never;
		}
	}

	return result as UpdateProductInput;
}

function isMissingCreateField(payload: CreateProductInput): boolean {
	return !payload.store_id ||
		!payload.sku ||
		!payload.name ||
		!payload.base_unit_id ||
		payload.price_base === undefined ||
		payload.cost_base === undefined;
}

export class ProductComponent {
	static async getAll(requestId: string, storeId?: string): Promise<Product[]> {
		void requestId;
		return ProductInterface.findAll(storeId);
	}

	static async getById(requestId: string, id: string): Promise<Product> {
		void requestId;
		const product = await ProductInterface.findById(id);
		if (!product) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.PRODUCT_NOT_FOUND);
		}
		return product;
	}

	static async create(requestId: string, payload: CreateProductInput): Promise<Product> {
		void requestId;
		if (!payload || isMissingCreateField(payload)) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.PRODUCT_REQUIRED_FIELDS);
		}

		return ProductInterface.create(payload);
	}

	static async update(requestId: string, id: string, data: Record<string, unknown>): Promise<Product> {
		void requestId;
		const updateData = pickUpdateFields(data || {});
		return ProductInterface.update(id, updateData);
	}

	static async delete(requestId: string, id: string): Promise<void> {
		void requestId;
		const ok = await ProductInterface.delete(id);
		if (!ok) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.PRODUCT_NOT_FOUND);
		}
	}
}
