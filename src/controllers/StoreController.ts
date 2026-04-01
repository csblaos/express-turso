import { Request, Response } from "express";

import { StoreComponent } from "@components/StoreComponent";
import { SyncFunction } from "@middlewares/SyncFunction";
import { CreateStoreInput } from "@models/Store";

export class StoreController {
	static getAll = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await StoreComponent.getAll(req.requestId);
		res.json({ success: true, data });
	});

	static getById = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await StoreComponent.getById(req.requestId, req.params.id as string);
		res.json({ success: true, data });
	});

	static create = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await StoreComponent.create(req.requestId, req.body as CreateStoreInput);
		res.status(201).json({ success: true, data });
	});

	static update = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await StoreComponent.update(req.requestId, req.params.id as string, req.body || {});
		res.json({ success: true, data });
	});

	static delete = SyncFunction.handler(async (req: Request, res: Response) => {
		await StoreComponent.delete(req.requestId, req.params.id as string);
		res.json({ success: true });
	});
}

