import { z } from "zod";

import { ValidatorMiddleware } from "@middlewares/ValidatorMiddleware";

const updateSchema = z.object({
	payment_max_accounts_per_store: z.coerce.number().int().min(1),
});

export default class SuperadminConfigValidator {
	static update = ValidatorMiddleware.init({ body: updateSchema });
}
