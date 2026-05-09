import { z } from "zod";

import { ValidatorMiddleware } from "@middlewares/ValidatorMiddleware";

const nonEmptyString = z.string().trim().min(1, "must be a non-empty string");
const optionalString = z.string().trim().nullish();

export default class RbacValidator extends ValidatorMiddleware {
	private static readonly listRolesQuerySchema = z.object({
		store_id: z.string().trim().optional(),
	});

	private static readonly listStoreMembersQuerySchema = z.object({
		store_id: nonEmptyString,
		search: z.string().trim().optional(),
		status: z.string().trim().optional(),
		role_id: z.string().trim().optional(),
	});

	private static readonly createRoleBodySchema = z.object({
		store_id: nonEmptyString,
		name: nonEmptyString,
		is_system: z.number().int().min(0).max(1).optional(),
		permission_keys: z.array(nonEmptyString).optional(),
		actor_user_id: optionalString,
	});

	private static readonly updateRoleBodySchema = z.object({
		store_id: optionalString,
		name: optionalString,
		is_system: z.number().int().min(0).max(1).optional(),
		permission_keys: z.array(nonEmptyString).optional(),
		actor_user_id: optionalString,
	});

	private static readonly duplicateRoleBodySchema = z.object({
		name: nonEmptyString,
		actor_user_id: optionalString,
	});

	private static readonly getUserPermissionsQuerySchema = z.object({
		store_id: z.string().trim().optional(),
	});

	private static readonly assignStoreMemberRoleBodySchema = z.object({
		role_id: nonEmptyString,
		status: optionalString,
		added_by: optionalString,
	});

	private static readonly createStoreMemberBodySchema = z.object({
		store_id: nonEmptyString,
		name: nonEmptyString,
		email: z.string().trim().email(),
		password: z.string().min(6, "password must be at least 6 characters"),
		role_id: nonEmptyString.optional(),
		status: optionalString,
		system_role: optionalString,
		ui_locale: optionalString,
		added_by: optionalString,
	});

	private static readonly updateStoreMemberStatusBodySchema = z.object({
		status: nonEmptyString,
		added_by: optionalString,
	});

	private static readonly resetStoreMemberPasswordBodySchema = z.object({
		password: z.string().min(6, "password must be at least 6 characters"),
		must_change_password: z.boolean().optional(),
		actor_user_id: optionalString,
	});

	public static readonly listStoreMembers = RbacValidator.init({
		query: RbacValidator.listStoreMembersQuerySchema,
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

	public static readonly duplicateRole = RbacValidator.init({
		params: z.object({
			id: nonEmptyString,
		}),
		body: RbacValidator.duplicateRoleBodySchema,
	});

	public static readonly deleteRole = RbacValidator.init({
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

	public static readonly createStoreMember = RbacValidator.init({
		body: RbacValidator.createStoreMemberBodySchema,
	});

	public static readonly updateStoreMemberStatus = RbacValidator.init({
		params: z.object({
			storeId: nonEmptyString,
			userId: nonEmptyString,
		}),
		body: RbacValidator.updateStoreMemberStatusBodySchema,
	});

	public static readonly resetStoreMemberPassword = RbacValidator.init({
		params: z.object({
			storeId: nonEmptyString,
			userId: nonEmptyString,
		}),
		body: RbacValidator.resetStoreMemberPasswordBodySchema,
	});
}
