import { z } from "zod";

import { ValidatorMiddleware } from "@middlewares/ValidatorMiddleware";

const period = z.object({
	preset: z.enum([ "today", "yesterday", "this_week", "last_week", "this_month", "last_month", "custom", "7d", "30d" ]).optional(),
	range: z.enum([ "today", "7d", "30d" ]).optional(),
	date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
	date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
	timezone_offset: z.coerce.number().int().min(-840).max(840).default(420),
});

export default class SystemAdminReportValidator extends ValidatorMiddleware {
	static readonly list = SystemAdminReportValidator.init({ query: period });
	static readonly detail = SystemAdminReportValidator.init({
		params: z.object({ storeId: z.string().trim().min(1) }),
		query: period,
	});
}
