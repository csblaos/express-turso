import { Request, Response } from "express";

import { InventoryComponent } from "@components/InventoryComponent";
import { InventoryAdjustmentInput, InventoryFilters } from "@interfaces/InventoryInterface";
import { SyncFunction } from "@middlewares/SyncFunction";
import { SuccessHandler } from "@utils/SuccessHandler";

export class InventoryController {
	static getBalances = SyncFunction.handler(async (req: Request, res: Response) => {
		const query = req.query as Record<string, unknown>;
		const filters: InventoryFilters = {
			storeId: typeof query.store_id === "string" ? query.store_id : undefined,
			query: typeof query.query === "string" ? query.query : undefined,
			status: typeof query.status === "string" ? query.status as InventoryFilters["status"] : undefined,
			sort: typeof query.sort === "string" ? query.sort as InventoryFilters["sort"] : undefined,
		};

		const data = await InventoryComponent.getBalances(req.requestId, filters);
		SuccessHandler.send(res, req.requestId, { data });
	});

	static getMovements = SyncFunction.handler(async (req: Request, res: Response) => {
		const query = req.query as Record<string, unknown>;
		const rawLimit = query.limit;
		const parsedLimit = typeof rawLimit === "number"
			? rawLimit
			: typeof rawLimit === "string"
				? Number(rawLimit)
				: undefined;
		const data = await InventoryComponent.getMovements(req.requestId, {
			storeId: typeof query.store_id === "string" ? query.store_id : undefined,
			productId: typeof query.product_id === "string" ? query.product_id : undefined,
			limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
			query: typeof query.query === "string" ? query.query : undefined,
			type: typeof query.type === "string" ? query.type : undefined,
			from: typeof query.from === "string" ? query.from : undefined,
			to: typeof query.to === "string" ? query.to : undefined,
		});

		SuccessHandler.send(res, req.requestId, { data });
	});

	static adjust = SyncFunction.handler(async (req: Request, res: Response) => {
		const payload = req.body as InventoryAdjustmentInput;
		// Do not trust client-provided created_by; use the authenticated user id to satisfy FK and audit trail.
		const data = await InventoryComponent.adjust(req.requestId, {
			...payload,
			created_by: req.auth?.userId || null,
		});
		SuccessHandler.created(res, req.requestId, { data });
	});
}
