import { z } from "zod";

import { ValidatorMiddleware } from "@middlewares/ValidatorMiddleware";

const nonEmptyString = z.string().trim().min(1, "must be a non-empty string");
const optionalString = z.string().trim().nullish();

export default class SystemAdminClientValidator extends ValidatorMiddleware {
	private static readonly listQuerySchema = z.object({
		search: z.string().trim().optional(),
		status: z.enum([ "all", "active", "suspended" ]).optional(),
	});

	private static readonly createBodySchema = z.object({
		name: nonEmptyString,
		email: z.string().trim().email(),
		password: z.string().min(6, "password must be at least 6 characters"),
		ui_locale: optionalString,
		max_stores: z.number().int().positive().nullable().optional(),
		can_create_stores: z.number().int().min(0).max(1).optional(),
		max_branches_per_store: z.number().int().positive().nullable().optional(),
		can_create_branches: z.number().int().min(0).max(1).optional(),
		must_change_password: z.boolean().optional(),
		created_by: optionalString,
	});

	private static readonly updateBodySchema = z.object({
		name: optionalString,
		email: z.string().trim().email().optional(),
		ui_locale: optionalString,
		max_stores: z.number().int().positive().nullable().optional(),
		can_create_stores: z.number().int().min(0).max(1).optional(),
		max_branches_per_store: z.number().int().positive().nullable().optional(),
		can_create_branches: z.number().int().min(0).max(1).optional(),
		must_change_password: z.boolean().optional(),
		actor_user_id: optionalString,
	});

	private static readonly updateStatusBodySchema = z.object({
		status: z.enum([ "active", "suspended" ]),
		reason: optionalString,
		actor_user_id: optionalString,
	});

	private static readonly resetPasswordBodySchema = z.object({
		password: z.string().min(6, "password must be at least 6 characters"),
		must_change_password: z.boolean().optional(),
		actor_user_id: optionalString,
	});

	private static readonly deleteBodySchema = z.object({
		actor_user_id: optionalString,
	});

	public static readonly list = SystemAdminClientValidator.init({
		query: SystemAdminClientValidator.listQuerySchema,
	});

	public static readonly create = SystemAdminClientValidator.init({
		body: SystemAdminClientValidator.createBodySchema,
	});

	public static readonly update = SystemAdminClientValidator.init({
		params: z.object({
			id: nonEmptyString,
		}),
		body: SystemAdminClientValidator.updateBodySchema,
	});

	public static readonly updateStatus = SystemAdminClientValidator.init({
		params: z.object({
			id: nonEmptyString,
		}),
		body: SystemAdminClientValidator.updateStatusBodySchema,
	});

	public static readonly resetPassword = SystemAdminClientValidator.init({
		params: z.object({
			id: nonEmptyString,
		}),
		body: SystemAdminClientValidator.resetPasswordBodySchema,
	});

	public static readonly deleteCheck = SystemAdminClientValidator.init({
		params: z.object({
			id: nonEmptyString,
		}),
	});

	public static readonly remove = SystemAdminClientValidator.init({
		params: z.object({
			id: nonEmptyString,
		}),
		body: SystemAdminClientValidator.deleteBodySchema,
	});
}
