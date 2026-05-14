import { z } from "zod";

import { ValidatorMiddleware } from "@middlewares/ValidatorMiddleware";

const nonEmptyString = z.string().trim().min(1, "must be a non-empty string");
const optionalString = z.string().nullish();

export default class UnitValidator extends ValidatorMiddleware {
	private static readonly listQuerySchema = z.object({
		store_id: z.string().optional(),
		scope: z.string().optional(),
	});

	private static readonly createBodySchema = z.object({
		code: nonEmptyString,
		name_th: nonEmptyString,
		scope: optionalString,
		store_id: optionalString,
	});

	private static readonly updateBodySchema = z.object({
		code: optionalString,
		name_th: optionalString,
		scope: optionalString,
		store_id: optionalString,
	});

	private static readonly importDefaultsBodySchema = z.object({
		store_id: nonEmptyString,
	});

	public static readonly list = UnitValidator.init({
		query: UnitValidator.listQuerySchema,
	});

	public static readonly create = UnitValidator.init({
		body: UnitValidator.createBodySchema,
	});

	public static readonly update = UnitValidator.init({
		params: z.object({
			id: nonEmptyString,
		}),
		body: UnitValidator.updateBodySchema,
	});

	public static readonly importDefaults = UnitValidator.init({
		body: UnitValidator.importDefaultsBodySchema,
	});
}
