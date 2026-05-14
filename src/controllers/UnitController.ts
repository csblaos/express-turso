import { Request, Response } from "express";

import { UnitComponent } from "@components/UnitComponent";
import { SyncFunction } from "@middlewares/SyncFunction";
import { CreateUnitInput } from "@models/Unit";
import { SuccessHandler } from "@utils/SuccessHandler";

export class UnitController {
	static getAll = SyncFunction.handler(async (req: Request, res: Response) => {
		const storeId = typeof req.query.store_id === "string" ? req.query.store_id : undefined;
		const scope = typeof req.query.scope === "string" ? req.query.scope : undefined;
		const data = await UnitComponent.getAll(req.requestId, { storeId, scope });
		SuccessHandler.send(res, req.requestId, { data });
	});

	static getById = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await UnitComponent.getById(req.requestId, req.params.id as string);
		SuccessHandler.send(res, req.requestId, { data });
	});

	static create = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await UnitComponent.create(req.requestId, req.body as CreateUnitInput);
		SuccessHandler.created(res, req.requestId, { data });
	});

	static importDefaults = SyncFunction.handler(async (req: Request, res: Response) => {
		const storeId = typeof req.body?.store_id === "string" ? req.body.store_id : "";
		const data = await UnitComponent.importDefaults(req.requestId, storeId);
		SuccessHandler.send(res, req.requestId, { data });
	});

	static update = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await UnitComponent.update(req.requestId, req.params.id as string, req.body || {});
		SuccessHandler.send(res, req.requestId, { data });
	});

	static delete = SyncFunction.handler(async (req: Request, res: Response) => {
		await UnitComponent.delete(req.requestId, req.params.id as string);
		SuccessHandler.send(res, req.requestId);
	});
}
