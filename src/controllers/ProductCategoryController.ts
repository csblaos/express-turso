import { Request, Response } from "express";

import { ProductCategoryComponent } from "@components/ProductCategoryComponent";
import { SyncFunction } from "@middlewares/SyncFunction";
import { CreateProductCategoryInput } from "@models/ProductCategory";
import { SuccessHandler } from "@utils/SuccessHandler";

export class ProductCategoryController {
	static getAll = SyncFunction.handler(async (req: Request, res: Response) => {
		const storeId = typeof req.query.store_id === "string" ? req.query.store_id : undefined;
		const data = await ProductCategoryComponent.getAll(req.requestId, storeId);
		SuccessHandler.send(res, req.requestId, { data });
	});

	static getById = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await ProductCategoryComponent.getById(req.requestId, req.params.id as string);
		SuccessHandler.send(res, req.requestId, { data });
	});

	static create = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await ProductCategoryComponent.create(req.requestId, req.body as CreateProductCategoryInput);
		SuccessHandler.created(res, req.requestId, { data });
	});

	static update = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await ProductCategoryComponent.update(req.requestId, req.params.id as string, req.body || {});
		SuccessHandler.send(res, req.requestId, { data });
	});

	static delete = SyncFunction.handler(async (req: Request, res: Response) => {
		await ProductCategoryComponent.delete(req.requestId, req.params.id as string);
		SuccessHandler.send(res, req.requestId);
	});
}
