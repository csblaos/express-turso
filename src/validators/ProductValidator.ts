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
}
