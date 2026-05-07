import { Request, Response } from "express";

import { ProductUnitComponent } from "@components/ProductUnitComponent";
import { SyncFunction } from "@middlewares/SyncFunction";
import { CreateProductUnitInput } from "@models/ProductUnit";
import { SuccessHandler } from "@utils/SuccessHandler";

export class ProductUnitController {
	static getAll = SyncFunction.handler(async (req: Request, res: Response) => {
		const productId = typeof req.query.product_id === "string" ? req.query.product_id : undefined;
		const unitId = typeof req.query.unit_id === "string" ? req.query.unit_id : undefined;
		const data = await ProductUnitComponent.getAll(req.requestId, { productId, unitId });
		SuccessHandler.send(res, req.requestId, { data });
	});

	static getById = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await ProductUnitComponent.getById(req.requestId, req.params.id as string);
		SuccessHandler.send(res, req.requestId, { data });
	});

	static create = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await ProductUnitComponent.create(req.requestId, req.body as CreateProductUnitInput);
		SuccessHandler.created(res, req.requestId, { data });
	});

	static update = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await ProductUnitComponent.update(req.requestId, req.params.id as string, req.body || {});
		SuccessHandler.send(res, req.requestId, { data });
	});

	static delete = SyncFunction.handler(async (req: Request, res: Response) => {
		await ProductUnitComponent.delete(req.requestId, req.params.id as string);
		SuccessHandler.send(res, req.requestId);
	});
}
