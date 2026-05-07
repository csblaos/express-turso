import { Request, Response } from "express";

import { AuditEventComponent } from "@components/AuditEventComponent";
import { AuditEventCreatePayload, AuditEventFilters } from "@interfaces/AuditEventInterface";
import { SyncFunction } from "@middlewares/SyncFunction";
import { SuccessHandler } from "@utils/SuccessHandler";

export class AuditEventController {
	static list = SyncFunction.handler(async (req: Request, res: Response) => {
		const query = req.query as Record<string, unknown>;
		const filters: AuditEventFilters = {
			storeId: typeof query.store_id === "string" ? query.store_id : undefined,
			query: typeof query.query === "string" ? query.query : undefined,
			scope: typeof query.scope === "string" ? query.scope : undefined,
			result: typeof query.result === "string" ? query.result : undefined,
			entityType: typeof query.entity_type === "string" ? query.entity_type : undefined,
			actorRole: typeof query.actor_role === "string" ? query.actor_role : undefined,
			limit: typeof query.limit === "number" ? query.limit : typeof query.limit === "string" ? Number(query.limit) : undefined,
		};

		const data = await AuditEventComponent.getEvents(req.requestId, filters);
		SuccessHandler.send(res, req.requestId, { data });
	});

	static getById = SyncFunction.handler(async (req: Request, res: Response) => {
		const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
		const data = await AuditEventComponent.getEventById(req.requestId, id);
		SuccessHandler.send(res, req.requestId, { data });
	});

	static create = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await AuditEventComponent.createEvent(req.requestId, req.body as AuditEventCreatePayload);
		SuccessHandler.created(res, req.requestId, { data });
	});
}
