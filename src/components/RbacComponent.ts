import { ErrorConfig } from "@configs/ErrorConfig";
import { AuditEventComponent } from "@components/AuditEventComponent";
import { AuthInterface } from "@interfaces/AuthInterface";
import {
	RbacInterface,
	RoleWithPermissions,
	StoreMemberCreateInput,
	StoreMemberListItem,
	StoreMemberPasswordResetInput,
	StoreMemberStatusUpdateInput,
	UserAccessSummary,
} from "@interfaces/RbacInterface";
import { ApiError } from "@middlewares/ApiError";
import { CreateRoleInput, UpdateRoleInput } from "@models/Role";

function isMissingRoleCreateField(payload: CreateRoleInput): boolean {
	return !payload.store_id || !payload.name;
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

	static async listRoles(requestId: string, storeId?: string): Promise<RoleWithPermissions[]> {
		void requestId;
		return RbacInterface.listRoles(storeId);
	}

	static async getRoleById(requestId: string, id: string): Promise<RoleWithPermissions> {
		void requestId;
		const role = await RbacInterface.getRoleById(id);
		if (!role) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.ROLE_NOT_FOUND);
		}
		return role;
	}

	static async createRole(
		requestId: string,
		payload: CreateRoleInput & { permission_keys?: string[]; actor_user_id?: string | null },
	): Promise<RoleWithPermissions> {
		void requestId;
		if (!payload || isMissingRoleCreateField(payload)) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.ROLE_REQUIRED_FIELDS);
		}

		const role = await RbacInterface.createRole(payload, payload.permission_keys);
		await RbacComponent.logAudit(requestId, {
			store_id: role.store_id,
			actor_user_id: payload.actor_user_id,
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
	): Promise<RoleWithPermissions> {
		const before = await RbacInterface.getRoleById(id);
		const role = await RbacInterface.updateRole(id, payload, payload.permission_keys);
		if (!role) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.ROLE_NOT_FOUND);
		}
		await RbacComponent.logAudit(requestId, {
			store_id: role.store_id,
			actor_user_id: payload.actor_user_id,
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
	): Promise<RoleWithPermissions> {
		const sourceRole = await RbacInterface.getRoleById(id);
		if (!sourceRole) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.ROLE_NOT_FOUND);
		}
		const role = await RbacInterface.duplicateRole(id, payload.name);
		if (!role) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.ROLE_NOT_FOUND);
		}
		await RbacComponent.logAudit(requestId, {
			store_id: role.store_id,
			actor_user_id: payload.actor_user_id,
			action: "duplicate_role",
			entity_type: "role",
			entity_id: role.id,
			before: sourceRole,
			after: role,
			metadata: { source_role_id: sourceRole.id },
		});
		return role;
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
	): Promise<UserAccessSummary> {
		const role = await RbacInterface.getRoleById(payload.role_id);
		if (!role) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.ROLE_NOT_FOUND);
		}

		const before = await RbacInterface.getStoreMemberById(storeId, userId);
		const access = await RbacInterface.assignStoreMemberRole({
			store_id: storeId,
			user_id: userId,
			role_id: payload.role_id,
			status: payload.status,
			added_by: payload.added_by,
		});
		const after = await RbacInterface.getStoreMemberById(storeId, userId);
		await RbacComponent.logAudit(requestId, {
			store_id: storeId,
			actor_user_id: payload.added_by,
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
	): Promise<StoreMemberListItem[]> {
		void requestId;
		return RbacInterface.listStoreMembers(params);
	}

	static async createStoreMember(
		requestId: string,
		payload: StoreMemberCreateInput,
	): Promise<StoreMemberListItem> {
		const role = await RbacInterface.getRoleById(payload.role_id);
		if (!role) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.ROLE_NOT_FOUND);
		}

		const member = await RbacInterface.createStoreMember(payload);
		await RbacComponent.logAudit(requestId, {
			store_id: payload.store_id,
			actor_user_id: payload.added_by,
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
	): Promise<StoreMemberListItem> {
		const before = await RbacInterface.getStoreMemberById(payload.store_id, payload.user_id);
		const member = await RbacInterface.updateStoreMemberStatus(payload);
		if (!member) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.STORE_MEMBER_NOT_FOUND);
		}
		await RbacComponent.logAudit(requestId, {
			store_id: payload.store_id,
			actor_user_id: payload.added_by,
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
	): Promise<StoreMemberListItem> {
		const before = await RbacInterface.getStoreMemberById(payload.store_id, payload.user_id);
		const member = await RbacInterface.resetStoreMemberPassword(payload);
		if (!member) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.STORE_MEMBER_NOT_FOUND);
		}
		await RbacComponent.logAudit(requestId, {
			store_id: payload.store_id,
			actor_user_id: payload.actor_user_id,
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
