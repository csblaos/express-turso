import { z } from "zod";

import { ValidatorMiddleware } from "@middlewares/ValidatorMiddleware";

const nonEmptyString = z.string().trim().min(1, "must be a non-empty string");
const optionalString = z.string().trim().nullish();

export default class RbacValidator extends ValidatorMiddleware {
	private static readonly listRolesQuerySchema = z.object({
		store_id: z.string().trim().optional(),
	});

	private static readonly createRoleBodySchema = z.object({
		store_id: nonEmptyString,
		name: nonEmptyString,
		is_system: z.number().int().min(0).max(1).optional(),
		permission_keys: z.array(nonEmptyString).optional(),
	});

	private static readonly updateRoleBodySchema = z.object({
		store_id: optionalString,
		name: optionalString,
		is_system: z.number().int().min(0).max(1).optional(),
		permission_keys: z.array(nonEmptyString).optional(),
	});

	private static readonly getUserPermissionsQuerySchema = z.object({
		store_id: z.string().trim().optional(),
	});

	private static readonly assignStoreMemberRoleBodySchema = z.object({
		role_id: nonEmptyString,
		status: optionalString,
		added_by: optionalString,
	});

	public static readonly listRoles = RbacValidator.init({
		query: RbacValidator.listRolesQuerySchema,
	});

	public static readonly createRole = RbacValidator.init({
		body: RbacValidator.createRoleBodySchema,
	});

	public static readonly updateRole = RbacValidator.init({
		params: z.object({
			id: nonEmptyString,
		}),
		body: RbacValidator.updateRoleBodySchema,
	});

	public static readonly getRoleById = RbacValidator.init({
		params: z.object({
			id: nonEmptyString,
		}),
	});

	public static readonly getUserPermissions = RbacValidator.init({
		params: z.object({
			userId: nonEmptyString,
		}),
		query: RbacValidator.getUserPermissionsQuerySchema,
	});

	public static readonly assignStoreMemberRole = RbacValidator.init({
		params: z.object({
			storeId: nonEmptyString,
			userId: nonEmptyString,
		}),
		body: RbacValidator.assignStoreMemberRoleBodySchema,
	});
}
