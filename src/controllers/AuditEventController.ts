import { Request, Response } from "express";

import { AuditEventComponent } from "@components/AuditEventComponent";
import { AuditEventCreatePayload, AuditEventFilters } from "@interfaces/AuditEventInterface";
import { ApiError } from "@middlewares/ApiError";
import { SyncFunction } from "@middlewares/SyncFunction";
import { SuccessHandler } from "@utils/SuccessHandler";

export class AuditEventController {
	static list = SyncFunction.handler(async (req: Request, res: Response) => {
		const query = req.query as Record<string, unknown>;
		const requestedStoreId = typeof query.store_id === "string" ? query.store_id.trim() : "";
		const storeId = String(req.auth?.storeId || "").trim();
		if (!storeId) throw ApiError.ForbiddenError("Active store is required");
		if (requestedStoreId && requestedStoreId !== storeId) {
			throw ApiError.ForbiddenError("Store scope mismatch");
		}
		const filters: AuditEventFilters = {
			storeId,
			// This is already restricted to the active store workspace. An owner may
			// also have a system-admin role, but their store activity must be visible.
			excludePrivilegedActors: false,
			query: typeof query.query === "string" ? query.query : undefined,
			scope: typeof query.scope === "string" ? query.scope : undefined,
			result: typeof query.result === "string" ? query.result : undefined,
			entityType: typeof query.entity_type === "string" ? query.entity_type : undefined,
			actorRole: typeof query.actor_role === "string" ? query.actor_role : undefined,
			from: typeof query.from === "string" ? query.from : undefined,
			to: typeof query.to === "string" ? query.to : undefined,
			page: typeof query.page === "number" ? query.page : typeof query.page === "string" ? Number(query.page) : undefined,
			limit: typeof query.limit === "number" ? query.limit : typeof query.limit === "string" ? Number(query.limit) : undefined,
		};

		const data = await AuditEventComponent.getEvents(req.requestId, filters);
		SuccessHandler.send(res, req.requestId, { data });
	});

	static getById = SyncFunction.handler(async (req: Request, res: Response) => {
		const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
		const storeId = String(req.auth?.storeId || "").trim();
		if (!storeId) throw ApiError.ForbiddenError("Active store is required");
		const data = await AuditEventComponent.getEventById(req.requestId, id, {
			storeId,
			excludePrivilegedActors: true,
		});
		SuccessHandler.send(res, req.requestId, { data });
	});

	static create = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await AuditEventComponent.createEvent(req.requestId, req.body as AuditEventCreatePayload);
		SuccessHandler.created(res, req.requestId, { data });
	});
}
