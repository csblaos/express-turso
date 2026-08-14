import { z } from "zod";

import { ValidatorMiddleware } from "@middlewares/ValidatorMiddleware";

export default class ReportValidator extends ValidatorMiddleware {
	private static readonly period = {
		store_id: z.string().trim().min(1).optional(),
		preset: z.enum(["today","yesterday","this_week","last_week","this_month","last_month","custom","7d","30d"]).optional(),
		range: z.enum(["today","7d","30d"]).optional(),
		date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
		date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
		timezone_offset: z.coerce.number().int().min(-840).max(840).default(420),
	};
	static readonly dashboard = ReportValidator.init({ query: z.object(ReportValidator.period) });
	static readonly products = ReportValidator.init({ query: z.object({
		...ReportValidator.period, search:z.string().trim().max(120).optional(),category_id:z.string().trim().max(120).optional(),
		sort:z.enum(["quantity","average_price","revenue","cost","profit","margin"]).default("revenue"),order:z.enum(["asc","desc"]).default("desc"),page:z.coerce.number().int().min(1).default(1),limit:z.coerce.number().int().min(5).max(100).default(20),
	}) });
	static readonly productTrend = ReportValidator.init({ params:z.object({productId:z.string().trim().min(1)}),query:z.object(ReportValidator.period) });
}
