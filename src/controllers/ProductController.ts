import { Request, Response } from "express";

import { ProductComponent } from "@components/ProductComponent";
import { SyncFunction } from "@middlewares/SyncFunction";
import { CreateProductInput } from "@models/Product";
import { SuccessHandler } from "@utils/SuccessHandler";

export class ProductController {
	static getAll = SyncFunction.handler(async (req: Request, res: Response) => {
		const storeId = typeof req.query.store_id === "string" ? req.query.store_id : undefined;
		const data = await ProductComponent.getAll(req.requestId, storeId);
		SuccessHandler.send(res, req.requestId, { data });
	});

	static getById = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await ProductComponent.getById(req.requestId, req.params.id as string);
		SuccessHandler.send(res, req.requestId, { data });
	});

	static create = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await ProductComponent.create(req.requestId, req.body as CreateProductInput);
		SuccessHandler.created(res, req.requestId, { data });
	});

	static update = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await ProductComponent.update(req.requestId, req.params.id as string, req.body || {});
		SuccessHandler.send(res, req.requestId, { data });
	});

	static delete = SyncFunction.handler(async (req: Request, res: Response) => {
		await ProductComponent.delete(req.requestId, req.params.id as string);
		SuccessHandler.send(res, req.requestId);
	});
}
