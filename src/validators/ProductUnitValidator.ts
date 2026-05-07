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

export default class ProductUnitValidator extends ValidatorMiddleware {
	private static readonly listQuerySchema = z.object({
		product_id: z.string().optional(),
		unit_id: z.string().optional(),
	});

	private static readonly createBodySchema = z.object({
		product_id: nonEmptyString,
		unit_id: nonEmptyString,
		multiplier_to_base: finiteNumber,
		price_per_unit: finiteNumber.nullish(),
		enabled_for_sale: finiteNumber.nullish(),
	});

	private static readonly updateBodySchema = z.object({
		product_id: z.string().nullish(),
		unit_id: z.string().nullish(),
		multiplier_to_base: finiteNumber.nullish(),
		price_per_unit: finiteNumber.nullish(),
		enabled_for_sale: finiteNumber.nullish(),
	});

	public static readonly list = ProductUnitValidator.init({
		query: ProductUnitValidator.listQuerySchema,
	});

	public static readonly create = ProductUnitValidator.init({
		body: ProductUnitValidator.createBodySchema,
	});

	public static readonly update = ProductUnitValidator.init({
		params: z.object({
			id: nonEmptyString,
		}),
		body: ProductUnitValidator.updateBodySchema,
	});
}
