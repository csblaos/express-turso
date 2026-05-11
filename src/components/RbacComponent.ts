import { ErrorConfig } from "@configs/ErrorConfig";
import { AuditEventComponent } from "@components/AuditEventComponent";
import { AuthInterface } from "@interfaces/AuthInterface";
import {
	RbacInterface,
	RoleSummary,
	RoleWithPermissions,
	StoreMemberCreateInput,
	StoreMemberListItem,
	StoreMemberPasswordResetInput,
	StoreMemberStatusUpdateInput,
	UserAccessSummary,
} from "@interfaces/RbacInterface";
import { StoreInterface } from "@interfaces/StoreInterface";
import { ApiError } from "@middlewares/ApiError";
import { CreateRoleInput, UpdateRoleInput } from "@models/Role";
import { hasPermissionByKey } from "@utils/PermissionCompat";

function isMissingRoleCreateField(payload: CreateRoleInput): boolean {
	return !payload.store_id || !payload.name;
}

function sanitizeRolePermissionKeysForActor(
	actor: { userId: string; systemRole: string },
	permissionKeys?: string[],
): string[] | undefined {
	if (!permissionKeys) return permissionKeys;
	if (actor.systemRole !== "superadmin") return permissionKeys;
	return permissionKeys.filter((permissionKey) => !permissionKey.startsWith("system_admin."));
}

async function resolveActor(actorUserId?: string | null) {
	if (!actorUserId) {
		return {
			actor_user_id: null,
			actor_name: null,
			actor_role: null,
		};
	}

	const actor = await AuthInterface.findUserById(actorUserId);
	return {
		actor_user_id: actorUserId,
		actor_name: actor?.name || null,
		actor_role: actor?.system_role || null,
	};
}

export class RbacComponent {
	private static async assertStoreSuperadminScope(
		actor: { userId: string; systemRole: string },
		storeId: string,
	): Promise<void> {
		if (!actor.userId) {
			throw ApiError.UnauthorizedError("Missing auth user");
		}
		if (actor.systemRole !== "superadmin") return;

		const store = await StoreInterface.findById(storeId);
		if (!store || store.owner_user_id !== actor.userId) {
			throw ApiError.ForbiddenError("Superadmin can manage only owned stores");
		}
	}

	private static async assertStorePermissionScope(
		actor: { userId: string; systemRole: string },
		storeId: string,
		requiredPermission: string,
	): Promise<void> {
		if (!actor.userId) {
			throw ApiError.UnauthorizedError("Missing auth user");
		}
		if (actor.systemRole === "system_admin") return;

		await RbacComponent.assertStoreSuperadminScope(actor, storeId);

		if (actor.systemRole === "superadmin") return;

		const access = await RbacInterface.getUserPermissions(actor.userId, storeId);
		const grantedPermissions = access.permissions.map((permission) => permission.key);
		const canAccess = hasPermissionByKey(grantedPermissions, requiredPermission);
		if (!canAccess) {
			throw ApiError.ForbiddenError(`Missing permission: ${requiredPermission}`);
		}
	}

	private static async assertStoreManageScope(actor: { userId: string; systemRole: string }, storeId: string): Promise<void> {
		await RbacComponent.assertStorePermissionScope(actor, storeId, "settings.users.update");
	}

	private static async logAudit(
		requestId: string,
		payload: {
			store_id?: string | null;
			actor_user_id?: string | null;
			action: string;
			entity_type: string;
			entity_id?: string | null;
			before?: unknown;
			after?: unknown;
			metadata?: unknown;
		},
	) {
		const actor = await resolveActor(payload.actor_user_id);
		await AuditEventComponent.createEvent(requestId, {
			scope: "settings",
			store_id: payload.store_id || null,
			action: payload.action,
			entity_type: payload.entity_type,
			entity_id: payload.entity_id || null,
			result: "success",
			request_id: requestId,
			...actor,
			before: payload.before,
			after: payload.after,
			metadata: payload.metadata,
		});
	}

	static async listPermissions(requestId: string) {
		void requestId;
		return RbacInterface.listPermissions();
	}

	static async listRoles(
		requestId: string,
		storeId: string | undefined,
		actor: { userId: string; systemRole: string },
	): Promise<RoleWithPermissions[]> {
		void requestId;
		if (storeId) {
			await RbacComponent.assertStorePermissionScope(actor, storeId, "settings.roles.view");
			return RbacInterface.ensureDefaultRolesForStore(storeId);
		} else if (actor.systemRole !== "system_admin") {
			throw ApiError.ForbiddenError("store_id is required");
		}
		return RbacInterface.listRoles(storeId);
	}

	static async listRoleSummaries(
		requestId: string,
		storeId: string | undefined,
		actor: { userId: string; systemRole: string },
	): Promise<RoleSummary[]> {
		void requestId;
		if (storeId) {
			await RbacComponent.assertStorePermissionScope(actor, storeId, "settings.roles.view");
			await RbacInterface.ensureDefaultRolePresetsForStore(storeId);
			return RbacInterface.listRoleSummaries(storeId);
		} else if (actor.systemRole !== "system_admin") {
			throw ApiError.ForbiddenError("store_id is required");
		}
		return RbacInterface.listRoleSummaries(storeId);
	}

	static async getRoleById(
		requestId: string,
		id: string,
		actor: { userId: string; systemRole: string },
	): Promise<RoleWithPermissions> {
		void requestId;
		const role = await RbacInterface.getRoleById(id);
		if (!role) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.ROLE_NOT_FOUND);
		}
		await RbacComponent.assertStorePermissionScope(actor, role.store_id, "settings.roles.view");
		return role;
	}

	static async createRole(
		requestId: string,
		payload: CreateRoleInput & { permission_keys?: string[]; actor_user_id?: string | null },
		actor: { userId: string; systemRole: string },
	): Promise<RoleWithPermissions> {
		void requestId;
		if (!payload || isMissingRoleCreateField(payload)) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.ROLE_REQUIRED_FIELDS);
		}
		await RbacComponent.assertStorePermissionScope(actor, payload.store_id, "settings.roles.create");

		const role = await RbacInterface.createRole(payload, sanitizeRolePermissionKeysForActor(actor, payload.permission_keys));
		await RbacComponent.logAudit(requestId, {
			store_id: role.store_id,
			actor_user_id: actor.userId,
			action: "create_role",
			entity_type: "role",
			entity_id: role.id,
			after: role,
		});
		return role;
	}

	static async updateRole(
		requestId: string,
		id: string,
		payload: UpdateRoleInput & { permission_keys?: string[]; actor_user_id?: string | null },
		actor: { userId: string; systemRole: string },
	): Promise<RoleWithPermissions> {
		const before = await RbacInterface.getRoleById(id);
		if (!before) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.ROLE_NOT_FOUND);
		}
		await RbacComponent.assertStorePermissionScope(actor, before.store_id, "settings.roles.update");
		const role = await RbacInterface.updateRole(id, payload, sanitizeRolePermissionKeysForActor(actor, payload.permission_keys));
		if (!role) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.ROLE_NOT_FOUND);
		}
		await RbacComponent.logAudit(requestId, {
			store_id: role.store_id,
			actor_user_id: actor.userId,
			action: "update_role",
			entity_type: "role",
			entity_id: role.id,
			before,
			after: role,
		});
		return role;
	}

	static async duplicateRole(
		requestId: string,
		id: string,
		payload: { name: string; actor_user_id?: string | null },
		actor: { userId: string; systemRole: string },
	): Promise<RoleWithPermissions> {
		const sourceRole = await RbacInterface.getRoleById(id);
		if (!sourceRole) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.ROLE_NOT_FOUND);
		}
		await RbacComponent.assertStorePermissionScope(actor, sourceRole.store_id, "settings.roles.create");
		const sanitizedPermissionKeys = sanitizeRolePermissionKeysForActor(
			actor,
			sourceRole.permissions.map((permission) => permission.key),
		);
		const role = await RbacInterface.duplicateRole(id, payload.name, sanitizedPermissionKeys);
		if (!role) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.ROLE_NOT_FOUND);
		}
		await RbacComponent.logAudit(requestId, {
			store_id: role.store_id,
			actor_user_id: actor.userId,
			action: "duplicate_role",
			entity_type: "role",
			entity_id: role.id,
			before: sourceRole,
			after: role,
			metadata: { source_role_id: sourceRole.id },
		});
		return role;
	}

	static async applyRoleToStore(
		requestId: string,
		id: string,
		payload: {
			target_store_id: string;
			mode: "create" | "update";
			name?: string | null;
			target_role_id?: string | null;
			actor_user_id?: string | null;
		},
		actor: { userId: string; systemRole: string },
	): Promise<RoleWithPermissions> {
		const sourceRole = await RbacInterface.getRoleById(id);
		if (!sourceRole) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.ROLE_NOT_FOUND);
		}

		const targetStoreId = String(payload.target_store_id || "").trim();
		if (!targetStoreId) {
			throw ApiError.BadRequestError("target_store_id is required");
		}
		if (targetStoreId === sourceRole.store_id) {
			throw ApiError.BadRequestError("Target store must be different from source store");
		}

		await RbacComponent.assertStorePermissionScope(actor, sourceRole.store_id, "settings.roles.view");
		if (payload.mode === "update") {
			await RbacComponent.assertStorePermissionScope(actor, targetStoreId, "settings.roles.update");
		} else {
			await RbacComponent.assertStorePermissionScope(actor, targetStoreId, "settings.roles.create");
		}

		try {
			const sanitizedPermissionKeys = sanitizeRolePermissionKeysForActor(
				actor,
				sourceRole.permissions.map((permission) => permission.key),
			);
			const role = await RbacInterface.applyRoleToStore(id, payload, sanitizedPermissionKeys);
			if (!role) {
				throw ApiError.CustomError(ErrorConfig.DOMAIN.ROLE_NOT_FOUND);
			}

			await RbacComponent.logAudit(requestId, {
				store_id: role.store_id,
				actor_user_id: actor.userId,
				action: "apply_role_to_store",
				entity_type: "role",
				entity_id: role.id,
				before: sourceRole,
				after: role,
				metadata: {
					source_role_id: sourceRole.id,
					source_store_id: sourceRole.store_id,
					target_store_id: targetStoreId,
					mode: payload.mode,
					target_role_id: payload.target_role_id || null,
				},
			});
			return role;
		} catch (error) {
			if (error instanceof Error && [ "ROLE_NOT_FOUND", "ROLE_NAME_REQUIRED" ].includes(error.message)) {
				throw ApiError.BadRequestError(
					error.message === "ROLE_NAME_REQUIRED"
						? "name is required when mode is create"
						: "Target role not found in selected store",
				);
			}
			throw error;
		}
	}

	static async deleteRole(
		requestId: string,
		id: string,
		actor: { userId: string; systemRole: string },
	): Promise<RoleWithPermissions> {
		const role = await RbacInterface.getRoleById(id);
		if (!role) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.ROLE_NOT_FOUND);
		}

		if (Number(role.is_system || 0) === 1) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.ROLE_DELETE_SYSTEM_FORBIDDEN);
		}

		await RbacComponent.assertStorePermissionScope(actor, role.store_id, "settings.roles.archive");

		let deleted: RoleWithPermissions | null = null;
		try {
			deleted = await RbacInterface.softDeleteRole(id);
		} catch (error) {
			if (error instanceof Error && error.message === "ROLE_DELETE_BLOCKED") {
				throw ApiError.CustomError(ErrorConfig.DOMAIN.ROLE_DELETE_BLOCKED);
			}
			throw error;
		}

		if (!deleted) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.ROLE_NOT_FOUND);
		}

		await RbacComponent.logAudit(requestId, {
			store_id: deleted.store_id,
			actor_user_id: actor.userId,
			action: "delete_role",
			entity_type: "role",
			entity_id: deleted.id,
			before: deleted,
			after: {
				id: deleted.id,
				deleted_at: new Date().toISOString(),
			},
		});

		return deleted;
	}

	static async getUserPermissions(
		requestId: string,
		userId: string,
		storeId?: string,
	): Promise<UserAccessSummary> {
		void requestId;
		return RbacInterface.getUserPermissions(userId, storeId);
	}

	static async assignStoreMemberRole(
		requestId: string,
		storeId: string,
		userId: string,
		payload: { role_id: string; status?: string; added_by?: string | null },
		actor: { userId: string; systemRole: string },
	): Promise<UserAccessSummary> {
		await RbacComponent.assertStoreManageScope(actor, storeId);
		const role = await RbacInterface.getRoleById(payload.role_id);
		if (!role) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.ROLE_NOT_FOUND);
		}
		if (role.store_id !== storeId) {
			throw ApiError.ForbiddenError("Role does not belong to this store");
		}

		const before = await RbacInterface.getStoreMemberById(storeId, userId);
		const access = await RbacInterface.assignStoreMemberRole({
			store_id: storeId,
			user_id: userId,
			role_id: payload.role_id,
			status: payload.status,
			added_by: actor.userId,
		});
		const after = await RbacInterface.getStoreMemberById(storeId, userId);
		await RbacComponent.logAudit(requestId, {
			store_id: storeId,
			actor_user_id: actor.userId,
			action: "assign_store_member_role",
			entity_type: "store_member",
			entity_id: userId,
			before,
			after,
		});
		return access;
	}

	static async listStoreMembers(
		requestId: string,
		params: { store_id: string; search?: string; status?: string; role_id?: string },
		actor: { userId: string; systemRole: string },
	): Promise<StoreMemberListItem[]> {
		void requestId;
		await RbacComponent.assertStoreManageScope(actor, params.store_id);
		return RbacInterface.listStoreMembers(params);
	}

	static async createStoreMember(
		requestId: string,
		payload: StoreMemberCreateInput,
		actor: { userId: string; systemRole: string },
	): Promise<StoreMemberListItem> {
		await RbacComponent.assertStoreManageScope(actor, payload.store_id);
		if (payload.role_id?.trim()) {
			const role = await RbacInterface.getRoleById(payload.role_id);
			if (!role) {
				throw ApiError.CustomError(ErrorConfig.DOMAIN.ROLE_NOT_FOUND);
			}
			if (role.store_id !== payload.store_id) {
				throw ApiError.ForbiddenError("Role does not belong to this store");
			}
		}

		let member: StoreMemberListItem;
		try {
			member = await RbacInterface.createStoreMember({
				...payload,
				added_by: actor.userId,
			});
		} catch (error) {
			if (error instanceof Error && error.message === "ROLE_NOT_FOUND") {
				throw ApiError.CustomError(ErrorConfig.DOMAIN.ROLE_NOT_FOUND);
			}
			throw error;
		}
		await RbacComponent.logAudit(requestId, {
			store_id: payload.store_id,
			actor_user_id: actor.userId,
			action: "create_store_member",
			entity_type: "store_member",
			entity_id: member.user_id,
			after: member,
		});
		return member;
	}

	static async updateStoreMemberStatus(
		requestId: string,
		payload: StoreMemberStatusUpdateInput,
		actor: { userId: string; systemRole: string },
	): Promise<StoreMemberListItem> {
		await RbacComponent.assertStoreManageScope(actor, payload.store_id);
		const before = await RbacInterface.getStoreMemberById(payload.store_id, payload.user_id);
		const member = await RbacInterface.updateStoreMemberStatus({
			...payload,
			added_by: actor.userId,
		});
		if (!member) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.STORE_MEMBER_NOT_FOUND);
		}
		await RbacComponent.logAudit(requestId, {
			store_id: payload.store_id,
			actor_user_id: actor.userId,
			action: "update_store_member_status",
			entity_type: "store_member",
			entity_id: payload.user_id,
			before,
			after: member,
		});
		return member;
	}

	static async resetStoreMemberPassword(
		requestId: string,
		payload: StoreMemberPasswordResetInput,
		actor: { userId: string; systemRole: string },
	): Promise<StoreMemberListItem> {
		await RbacComponent.assertStoreManageScope(actor, payload.store_id);
		const before = await RbacInterface.getStoreMemberById(payload.store_id, payload.user_id);
		const member = await RbacInterface.resetStoreMemberPassword({
			...payload,
			actor_user_id: actor.userId,
		});
		if (!member) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.STORE_MEMBER_NOT_FOUND);
		}
		await RbacComponent.logAudit(requestId, {
			store_id: payload.store_id,
			actor_user_id: actor.userId,
			action: "reset_store_member_password",
			entity_type: "store_member",
			entity_id: payload.user_id,
			before,
			after: {
				...member,
				password_reset: true,
				must_change_password: Boolean(payload.must_change_password),
			},
			metadata: {
				must_change_password: Boolean(payload.must_change_password),
			},
		});
		return member;
	}
}
