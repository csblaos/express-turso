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
		const data = await InventoryComponent.getMovements(req.requestId, {
			storeId: typeof query.store_id === "string" ? query.store_id : undefined,
			productId: typeof query.product_id === "string" ? query.product_id : undefined,
			limit: typeof query.limit === "number" ? query.limit : undefined,
		});

		SuccessHandler.send(res, req.requestId, { data });
	});

	static adjust = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await InventoryComponent.adjust(req.requestId, req.body as InventoryAdjustmentInput);
		SuccessHandler.created(res, req.requestId, { data });
	});
}
