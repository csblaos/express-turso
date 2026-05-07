import { Request, Response } from "express";

import { StoreComponent } from "@components/StoreComponent";
import { SyncFunction } from "@middlewares/SyncFunction";
import { CreateStoreInput } from "@models/Store";
import { SuccessHandler } from "@utils/SuccessHandler";

export class StoreController {
	static getAll = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await StoreComponent.getAll(req.requestId, {
			userId: req.auth?.userId || "",
			systemRole: req.auth?.systemRole || "",
		});
		SuccessHandler.send(res, req.requestId, { data });
	});

	static getById = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await StoreComponent.getById(req.requestId, req.params.id as string, {
			userId: req.auth?.userId || "",
			systemRole: req.auth?.systemRole || "",
		});
		SuccessHandler.send(res, req.requestId, { data });
	});

	static create = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await StoreComponent.create(req.requestId, req.body as CreateStoreInput, {
			userId: req.auth?.userId || "",
			systemRole: req.auth?.systemRole || "",
		});
		SuccessHandler.created(res, req.requestId, { data });
	});

	static update = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await StoreComponent.update(req.requestId, req.params.id as string, req.body || {}, {
			userId: req.auth?.userId || "",
			systemRole: req.auth?.systemRole || "",
		});
		SuccessHandler.send(res, req.requestId, { data });
	});

	static delete = SyncFunction.handler(async (req: Request, res: Response) => {
		await StoreComponent.delete(req.requestId, req.params.id as string, {
			userId: req.auth?.userId || "",
			systemRole: req.auth?.systemRole || "",
		});
		SuccessHandler.send(res, req.requestId);
	});
}
