import { z } from "zod";

import { ValidatorMiddleware } from "@middlewares/ValidatorMiddleware";

const nonEmptyString = z.string().trim().min(1, "must be a non-empty string");

export default class CommonValidator extends ValidatorMiddleware {
	private static readonly resourceIdParamsSchema = z.object({
		id: nonEmptyString,
	});

	public static readonly resourceId = CommonValidator.init({
		params: CommonValidator.resourceIdParamsSchema,
	});
}
