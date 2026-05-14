import { z } from "zod";

import CommonValidator from "@validators/CommonValidator";
import { ValidatorMiddleware } from "@middlewares/ValidatorMiddleware";

const optionalText = z.string().trim().min(1).optional();

const positiveInteger = z.preprocess((value) => {
	if (typeof value === "string") {
		const trimmed = value.trim();
		if (!trimmed) return undefined;
		const parsed = Number(trimmed);
		return Number.isFinite(parsed) ? parsed : value;
	}

	return value;
}, z.number().int("must be an integer").positive("must be greater than 0").max(200, "must be less than or equal to 200").optional());

export default class AuditEventValidator extends ValidatorMiddleware {
	private static readonly listQuerySchema = z.object({
		store_id: optionalText,
		query: optionalText,
		scope: optionalText,
		result: optionalText,
		entity_type: optionalText,
		actor_role: optionalText,
		page: positiveInteger,
		limit: positiveInteger,
	});

	private static readonly createBodySchema = z.object({
		scope: z.string().trim().min(1, "scope is required"),
		store_id: z.string().trim().min(1).nullish(),
		actor_user_id: z.string().trim().min(1).nullish(),
		actor_name: z.string().trim().min(1).nullish(),
		actor_role: z.string().trim().min(1).nullish(),
		action: z.string().trim().min(1, "action is required"),
		entity_type: z.string().trim().min(1, "entity_type is required"),
		entity_id: z.string().trim().min(1).nullish(),
		result: z.string().trim().min(1).nullish(),
		reason_code: z.string().trim().min(1).nullish(),
		ip_address: z.string().trim().min(1).nullish(),
		user_agent: z.string().trim().min(1).nullish(),
		request_id: z.string().trim().min(1).nullish(),
		metadata: z.any().optional(),
		before: z.any().optional(),
		after: z.any().optional(),
		occurred_at: z.string().trim().min(1).optional(),
	});

	public static readonly list = AuditEventValidator.init({
		query: AuditEventValidator.listQuerySchema,
	});

	public static readonly getById = CommonValidator.resourceId;

	public static readonly create = AuditEventValidator.init({
		body: AuditEventValidator.createBodySchema,
	});
}
