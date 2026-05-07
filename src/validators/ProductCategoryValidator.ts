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

export default class ProductCategoryValidator extends ValidatorMiddleware {
	private static readonly listQuerySchema = z.object({
		store_id: z.string().optional(),
	});

	private static readonly createBodySchema = z.object({
		store_id: nonEmptyString,
		name: nonEmptyString,
		sort_order: finiteNumber.nullish(),
	});

	private static readonly updateBodySchema = z.object({
		store_id: optionalString,
		name: optionalString,
		sort_order: finiteNumber.nullish(),
	});

	public static readonly list = ProductCategoryValidator.init({
		query: ProductCategoryValidator.listQuerySchema,
	});

	public static readonly create = ProductCategoryValidator.init({
		body: ProductCategoryValidator.createBodySchema,
	});

	public static readonly update = ProductCategoryValidator.init({
		params: z.object({
			id: nonEmptyString,
		}),
		body: ProductCategoryValidator.updateBodySchema,
	});
}
