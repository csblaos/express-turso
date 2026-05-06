import { ErrorConfig } from "@configs/ErrorConfig";
import { RbacInterface, RoleWithPermissions, UserAccessSummary } from "@interfaces/RbacInterface";
import { ApiError } from "@middlewares/ApiError";
import { CreateRoleInput, UpdateRoleInput } from "@models/Role";

function isMissingRoleCreateField(payload: CreateRoleInput): boolean {
	return !payload.store_id || !payload.name;
}

export class RbacComponent {
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
		payload: CreateRoleInput & { permission_keys?: string[] },
	): Promise<RoleWithPermissions> {
		void requestId;
		if (!payload || isMissingRoleCreateField(payload)) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.ROLE_REQUIRED_FIELDS);
		}

		return RbacInterface.createRole(payload, payload.permission_keys);
	}

	static async updateRole(
		requestId: string,
		id: string,
		payload: UpdateRoleInput & { permission_keys?: string[] },
	): Promise<RoleWithPermissions> {
		void requestId;
		const role = await RbacInterface.updateRole(id, payload, payload.permission_keys);
		if (!role) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.ROLE_NOT_FOUND);
		}
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
		void requestId;
		const role = await RbacInterface.getRoleById(payload.role_id);
		if (!role) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.ROLE_NOT_FOUND);
		}

		return RbacInterface.assignStoreMemberRole({
			store_id: storeId,
			user_id: userId,
			role_id: payload.role_id,
			status: payload.status,
			added_by: payload.added_by,
		});
	}
}
