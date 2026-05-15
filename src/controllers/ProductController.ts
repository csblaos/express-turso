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

	static listCostAdjustments = SyncFunction.handler(async (req: Request, res: Response) => {
		const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
		const data = await ProductComponent.getCostAdjustments(req.requestId, req.params.id as string, limit);
		SuccessHandler.send(res, req.requestId, { data });
	});

	static adjustCost = SyncFunction.handler(async (req: Request, res: Response) => {
		const auth = req.auth;
		const data = await ProductComponent.adjustCost(req.requestId, {
			productId: req.params.id as string,
			costBase: Number((req.body as Record<string, unknown>)?.cost_base),
			reason: typeof (req.body as Record<string, unknown>)?.reason === "string"
				? String((req.body as Record<string, unknown>).reason)
				: null,
			actor: auth ? { userId: auth.userId, role: auth.systemRole, storeId: auth.storeId } : null,
			ipAddress: req.ip || null,
			userAgent: req.header("user-agent") || null,
		});
		SuccessHandler.send(res, req.requestId, { data });
	});

	static bulkCreateVariants = SyncFunction.handler(async (req: Request, res: Response) => {
		const body = (req.body as Record<string, unknown>) || {};
		const data = await ProductComponent.bulkCreateVariants(req.requestId, {
			baseProductId: req.params.id as string,
			modelName: typeof body.model_name === "string" ? String(body.model_name) : undefined,
			axes: Array.isArray(body.axes) ? (body.axes as Array<{ key: string; label: string }>) : undefined,
			variants: (body.variants as Array<Record<string, unknown>>).map((item) => ({
				sku: String(item.sku || ""),
				barcode: item.barcode === null ? null : typeof item.barcode === "string" ? String(item.barcode) : undefined,
				price_base: Number(item.price_base),
				cost_base: Number(item.cost_base),
				active: item.active === 0 ? 0 : 1,
				variant_label: item.variant_label === null ? null : typeof item.variant_label === "string" ? String(item.variant_label) : undefined,
				variant_options: (item.variant_options && typeof item.variant_options === "object") ? (item.variant_options as Record<string, string>) : undefined,
			})),
		});
		SuccessHandler.send(res, req.requestId, { data });
	});
}
