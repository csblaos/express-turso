import { z } from "zod";

import { ValidatorMiddleware } from "@middlewares/ValidatorMiddleware";

const nonEmptyString = z.string().trim().min(1, "must be a non-empty string");

const finiteNumber = z.preprocess((value) => {
	if (typeof value === "string") {
		const trimmedValue = value.trim();
		if (trimmedValue === "") return value;
		const parsedValue = Number(trimmedValue);
		return Number.isFinite(parsedValue) ? parsedValue : value;
	}

	return value;
}, z.number().finite("must be a number"));

const optionalString = z.string().nullish();
const optionalNumber = finiteNumber.nullish();

export default class ProductValidator extends ValidatorMiddleware {
	private static readonly listQuerySchema = z.object({
		store_id: z.string().optional(),
	});

	private static readonly createBodySchema = z.object({
		store_id: nonEmptyString,
		sku: nonEmptyString,
		name: nonEmptyString,
		base_unit_id: nonEmptyString,
		price_base: finiteNumber,
		cost_base: finiteNumber,
		barcode: optionalString,
		active: optionalNumber,
		image_url: optionalString,
		category_id: optionalString,
		out_stock_threshold: optionalNumber,
		low_stock_threshold: optionalNumber,
		model_id: optionalString,
		variant_label: optionalString,
		variant_options_json: optionalString,
		variant_sort_order: optionalNumber,
		allow_base_unit_sale: optionalNumber,
	});

	private static readonly updateBodySchema = z.object({
		store_id: optionalString,
		sku: optionalString,
		name: optionalString,
		barcode: optionalString,
		base_unit_id: optionalString,
		price_base: optionalNumber,
		cost_base: optionalNumber,
		active: optionalNumber,
		image_url: optionalString,
		category_id: optionalString,
		out_stock_threshold: optionalNumber,
		low_stock_threshold: optionalNumber,
		model_id: optionalString,
		variant_label: optionalString,
		variant_options_json: optionalString,
		variant_sort_order: optionalNumber,
		allow_base_unit_sale: optionalNumber,
	});

	private static readonly costAdjustmentBodySchema = z.object({
		cost_base: finiteNumber,
		reason: z.string().trim().max(280).nullish(),
	});

	private static readonly bulkVariantItemSchema = z.object({
		sku: nonEmptyString.max(32),
		barcode: z.string().trim().max(64).nullable().optional(),
		price_base: finiteNumber,
		cost_base: finiteNumber,
		active: z.number().int().min(0).max(1).optional(),
		variant_label: z.string().trim().max(80).nullable().optional(),
		variant_options: z.record(z.string().trim().min(1).max(32), z.string().trim().min(1).max(64)).optional(),
	});

	private static readonly bulkVariantBodySchema = z.object({
		model_name: z.string().trim().max(160).optional(),
		axes: z.array(z.object({
			key: z.string().trim().min(1).max(32),
			label: z.string().trim().min(1).max(64),
		})).max(2).optional(),
		variants: z.array(ProductValidator.bulkVariantItemSchema).min(1).max(200),
	});

	public static readonly list = ProductValidator.init({
		query: ProductValidator.listQuerySchema,
	});

	public static readonly create = ProductValidator.init({
		body: ProductValidator.createBodySchema,
	});

	public static readonly update = ProductValidator.init({
		params: z.object({
			id: nonEmptyString,
		}),
		body: ProductValidator.updateBodySchema,
	});

	public static readonly adjustCost = ProductValidator.init({
		params: z.object({
			id: nonEmptyString,
		}),
		body: ProductValidator.costAdjustmentBodySchema,
	});

	public static readonly bulkCreateVariants = ProductValidator.init({
		params: z.object({
			id: nonEmptyString,
		}),
		body: ProductValidator.bulkVariantBodySchema,
	});
}
