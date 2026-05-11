import { AuditEventComponent } from "@components/AuditEventComponent";
import { ErrorConfig } from "@configs/ErrorConfig";
import { AuthInterface } from "@interfaces/AuthInterface";
import {
	SystemAdminClientCreateInput,
	SystemAdminClientDeleteCheck,
	SystemAdminClientInterface,
	SystemAdminClientListParams,
	SystemAdminClientPasswordResetInput,
	SystemAdminClientListResult,
	SystemAdminClientRecord,
	SystemAdminClientStatusInput,
	SystemAdminClientUpdateInput,
} from "@interfaces/SystemAdminClientInterface";
import { ApiError } from "@middlewares/ApiError";

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

export class SystemAdminClientComponent {
	private static async logAudit(
		requestId: string,
		payload: {
			actor_user_id?: string | null;
			action: string;
			entity_id?: string | null;
			before?: unknown;
			after?: unknown;
			metadata?: unknown;
		},
	) {
		const actor = await resolveActor(payload.actor_user_id);
		await AuditEventComponent.createEvent(requestId, {
			scope: "system_admin",
			store_id: null,
			action: payload.action,
			entity_type: "client_account",
			entity_id: payload.entity_id || null,
			result: "success",
			request_id: requestId,
			...actor,
			before: payload.before,
			after: payload.after,
			metadata: payload.metadata,
		});
	}

	static async listClients(requestId: string, params: SystemAdminClientListParams): Promise<SystemAdminClientListResult> {
		void requestId;
		return SystemAdminClientInterface.list(params);
	}

	static async createClient(requestId: string, payload: SystemAdminClientCreateInput): Promise<SystemAdminClientRecord> {
		if (!payload.name?.trim() || !payload.email?.trim() || !payload.password?.trim()) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.CLIENT_ACCOUNT_REQUIRED_FIELDS);
		}

		try {
			const created = await SystemAdminClientInterface.create(payload);
			await SystemAdminClientComponent.logAudit(requestId, {
				actor_user_id: payload.created_by,
				action: "create_client_account",
				entity_id: created.id,
				after: created,
			});
			return created;
		} catch (error) {
			if (error instanceof Error && error.message === "CLIENT_ALREADY_EXISTS") {
				throw ApiError.CustomError(ErrorConfig.DOMAIN.CLIENT_ACCOUNT_ALREADY_EXISTS);
			}
			throw error;
		}
	}

	static async updateClient(
		requestId: string,
		id: string,
		payload: SystemAdminClientUpdateInput & { actor_user_id?: string | null },
	): Promise<SystemAdminClientRecord> {
		const before = await SystemAdminClientInterface.findById(id);
		if (!before) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.CLIENT_ACCOUNT_NOT_FOUND);
		}

		if (payload.name !== undefined && !payload.name?.trim()) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.CLIENT_ACCOUNT_REQUIRED_FIELDS);
		}
		if (payload.email !== undefined && !payload.email?.trim()) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.CLIENT_ACCOUNT_REQUIRED_FIELDS);
		}

		let updated: SystemAdminClientRecord | null;
		try {
			updated = await SystemAdminClientInterface.update(id, payload);
		} catch (error) {
			if (error instanceof Error && error.message === "CLIENT_ALREADY_EXISTS") {
				throw ApiError.CustomError(ErrorConfig.DOMAIN.CLIENT_ACCOUNT_ALREADY_EXISTS);
			}
			throw error;
		}
		if (!updated) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.CLIENT_ACCOUNT_NOT_FOUND);
		}

		await SystemAdminClientComponent.logAudit(requestId, {
			actor_user_id: payload.actor_user_id,
			action: "update_client_account",
			entity_id: updated.id,
			before,
			after: updated,
		});

		return updated;
	}

	static async updateClientStatus(
		requestId: string,
		id: string,
		payload: SystemAdminClientStatusInput,
	): Promise<SystemAdminClientRecord> {
		const before = await SystemAdminClientInterface.findById(id);
		if (!before) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.CLIENT_ACCOUNT_NOT_FOUND);
		}

		const updated = await SystemAdminClientInterface.updateStatus(id, payload);
		if (!updated) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.CLIENT_ACCOUNT_NOT_FOUND);
		}

		await SystemAdminClientComponent.logAudit(requestId, {
			actor_user_id: payload.actor_user_id,
			action: payload.status === "suspended" ? "suspend_client_account" : "activate_client_account",
			entity_id: updated.id,
			before,
			after: updated,
			metadata: payload.reason ? { reason: payload.reason } : undefined,
		});

		return updated;
	}

	static async resetClientPassword(
		requestId: string,
		id: string,
		payload: SystemAdminClientPasswordResetInput,
	): Promise<SystemAdminClientRecord> {
		const before = await SystemAdminClientInterface.findById(id);
		if (!before) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.CLIENT_ACCOUNT_NOT_FOUND);
		}

		if (!payload.password?.trim()) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.CLIENT_ACCOUNT_REQUIRED_FIELDS);
		}

		const updated = await SystemAdminClientInterface.resetPassword(id, payload);
		if (!updated) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.CLIENT_ACCOUNT_NOT_FOUND);
		}

		await SystemAdminClientComponent.logAudit(requestId, {
			actor_user_id: payload.actor_user_id,
			action: "reset_client_password",
			entity_id: updated.id,
			before,
			after: {
				id: updated.id,
				email: updated.email,
				must_change_password: updated.must_change_password,
			},
			metadata: {
				must_change_password: Boolean(payload.must_change_password),
			},
		});

		return updated;
	}

	static async getClientDeleteCheck(requestId: string, id: string): Promise<SystemAdminClientDeleteCheck> {
		void requestId;
		const check = await SystemAdminClientInterface.getDeleteCheck(id);
		if (!check) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.CLIENT_ACCOUNT_NOT_FOUND);
		}

		return check;
	}

	static async deleteClient(
		requestId: string,
		id: string,
		payload: { actor_user_id?: string | null },
	): Promise<{ id: string; deleted: true }> {
		if (payload.actor_user_id && payload.actor_user_id === id) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.CLIENT_ACCOUNT_DELETE_SELF_FORBIDDEN);
		}

		const before = await SystemAdminClientInterface.findById(id);
		if (!before) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.CLIENT_ACCOUNT_NOT_FOUND);
		}

		const deleteCheck = await SystemAdminClientInterface.getDeleteCheck(id);
		if (!deleteCheck) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.CLIENT_ACCOUNT_NOT_FOUND);
		}

		if (!deleteCheck.can_delete) {
			throw ApiError.CustomError({
				...ErrorConfig.DOMAIN.CLIENT_ACCOUNT_DELETE_BLOCKED,
				message: deleteCheck.reasons[0] || ErrorConfig.DOMAIN.CLIENT_ACCOUNT_DELETE_BLOCKED.message,
			});
		}

		const deleted = await SystemAdminClientInterface.delete(id);
		if (!deleted) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.CLIENT_ACCOUNT_NOT_FOUND);
		}

		await SystemAdminClientComponent.logAudit(requestId, {
			actor_user_id: payload.actor_user_id,
			action: "delete_client_account",
			entity_id: id,
			before,
			metadata: {
				delete_check: deleteCheck,
			},
		});

		return {
			id,
			deleted: true,
		};
	}
}
