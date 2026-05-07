import { AuditEventCreatePayload, AuditEventFilters, AuditEventInterface, AuditEventRecord } from "@interfaces/AuditEventInterface";
import { AuthInterface } from "@interfaces/AuthInterface";
import { ApiError } from "@middlewares/ApiError";

function normalizeOptionalString(value?: string | null): string | null {
	const trimmed = value?.trim();
	return trimmed ? trimmed : null;
}

export class AuditEventComponent {
	static async getEvents(requestId: string, filters: AuditEventFilters): Promise<AuditEventRecord[]> {
		void requestId;
		return AuditEventInterface.findMany(filters);
	}

	static async getEventById(requestId: string, id: string): Promise<AuditEventRecord> {
		void requestId;
		const event = await AuditEventInterface.findById(id);
		if (!event) {
			throw ApiError.NotFoundError("Audit event not found");
		}

		return event;
	}

	static async createEvent(requestId: string, payload: AuditEventCreatePayload): Promise<AuditEventRecord> {
		void requestId;

		const normalized: AuditEventCreatePayload = {
			...payload,
			scope: payload.scope.trim(),
			action: payload.action.trim(),
			entity_type: payload.entity_type.trim(),
			store_id: normalizeOptionalString(payload.store_id),
			actor_user_id: normalizeOptionalString(payload.actor_user_id),
			actor_name: normalizeOptionalString(payload.actor_name),
			actor_role: normalizeOptionalString(payload.actor_role),
			entity_id: normalizeOptionalString(payload.entity_id),
			result: normalizeOptionalString(payload.result) ?? "success",
			reason_code: normalizeOptionalString(payload.reason_code),
			ip_address: normalizeOptionalString(payload.ip_address),
			user_agent: normalizeOptionalString(payload.user_agent),
			request_id: normalizeOptionalString(payload.request_id),
			occurred_at: normalizeOptionalString(payload.occurred_at) ?? undefined,
		};

		if (!normalized.scope || !normalized.action || !normalized.entity_type) {
			throw ApiError.BadRequestError("scope, action and entity_type are required");
		}

		if (normalized.actor_user_id) {
			const persistedActor = await AuthInterface.findPersistedUserById(normalized.actor_user_id);
			if (!persistedActor) {
				normalized.actor_user_id = null;
			}
		}

		return AuditEventInterface.create(normalized);
	}
}
